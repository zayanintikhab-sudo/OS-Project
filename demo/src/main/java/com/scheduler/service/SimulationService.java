package com.scheduler.service;

import com.scheduler.model.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class SimulationService {

    @Autowired
    private SimpMessagingTemplate ws;

    private final ScheduledExecutorService executor = Executors.newScheduledThreadPool(8);

    // Per-session state
    private final Map<String, ScheduledFuture<?>> activeSims   = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger>       sessionTime  = new ConcurrentHashMap<>();
    private final Map<String, AtomicBoolean>       pausedFlag   = new ConcurrentHashMap<>();
    private final Map<String, ScheduleResponse>    schedules    = new ConcurrentHashMap<>();
    private final Map<String, List<ThreadInput>>   sessionTh    = new ConcurrentHashMap<>();

    // ── Start fresh ───────────────────────────────────────────────────────
    public void start(String sessionId, ScheduleResponse schedule,
                      List<ThreadInput> threads, int speedMs) {
        stop(sessionId);
        schedules.put(sessionId, schedule);
        sessionTh.put(sessionId, new ArrayList<>(threads));
        sessionTime.put(sessionId, new AtomicInteger(0));
        pausedFlag.put(sessionId, new AtomicBoolean(false));
        launchTimer(sessionId, speedMs);
    }

    // ── Pause ─────────────────────────────────────────────────────────────
    public void pause(String sessionId) {
        AtomicBoolean flag = pausedFlag.get(sessionId);
        if (flag != null) flag.set(true);
    }

    // ── Resume ────────────────────────────────────────────────────────────
    public void resume(String sessionId, int speedMs) {
        AtomicBoolean flag = pausedFlag.get(sessionId);
        if (flag == null) return;
        flag.set(false);
        // Re-launch timer at (potentially new) speed
        ScheduledFuture<?> old = activeSims.remove(sessionId);
        if (old != null) old.cancel(true);
        launchTimer(sessionId, speedMs);
    }

    // ── Stop ──────────────────────────────────────────────────────────────
    public void stop(String sessionId) {
        ScheduledFuture<?> f = activeSims.remove(sessionId);
        if (f != null) f.cancel(true);
    }

    // ── Update schedule mid-sim (kill / add / priority change) ───────────
    public void updateSchedule(String sessionId, ScheduleResponse schedule,
                                List<ThreadInput> threads, int currentTime, int speedMs) {
        boolean wasPaused = false;
        AtomicBoolean flag = pausedFlag.get(sessionId);
        if (flag != null) { wasPaused = flag.get(); flag.set(true); }

        schedules.put(sessionId, schedule);
        sessionTh.put(sessionId, new ArrayList<>(threads));

        // Push an immediate SCHEDULE_UPDATE event so React refreshes its Gantt
        TickEvent evt = new TickEvent();
        evt.setType(TickEvent.EventType.TICK);
        evt.setCurrentTime(currentTime);
        evt.setThreads(buildLiveThreads(currentTime, schedule.getTimeline(), threads));
        evt.setNewLogs(List.of(new TickEvent.LogEntry(currentTime, "⚡ Schedule recomputed", "switch")));
        evt.setDone(false);
        ws.convertAndSend("/topic/simulation/" + sessionId, evt);

        if (!wasPaused) {
            if (flag != null) flag.set(false);
            ScheduledFuture<?> old = activeSims.remove(sessionId);
            if (old != null) old.cancel(true);
            launchTimer(sessionId, speedMs);
        }
    }

    // ── Timer loop ────────────────────────────────────────────────────────
    private void launchTimer(String sessionId, int speedMs) {
        ScheduledFuture<?> future = executor.scheduleAtFixedRate(() -> {
            try {
                AtomicBoolean paused = pausedFlag.get(sessionId);
                if (paused != null && paused.get()) return;

                ScheduleResponse sched = schedules.get(sessionId);
                List<ThreadInput> threads = sessionTh.get(sessionId);
                AtomicInteger clock = sessionTime.get(sessionId);
                if (sched == null || threads == null || clock == null) return;

                int t = clock.incrementAndGet();
                int maxTime = sched.getTimeline().stream().mapToInt(GanttSlot::getEnd).max().orElse(0);

                List<TickEvent.LiveThread> live = buildLiveThreads(t, sched.getTimeline(), threads);
                List<TickEvent.LogEntry> logs  = buildLogs(t, sched.getTimeline());

                TickEvent evt = new TickEvent();
                evt.setType(TickEvent.EventType.TICK);
                evt.setCurrentTime(t);
                evt.setThreads(live);
                evt.setNewLogs(logs);
                evt.setDone(t >= maxTime);

                ws.convertAndSend("/topic/simulation/" + sessionId, evt);

                if (t >= maxTime) stop(sessionId);

            } catch (Exception e) { e.printStackTrace(); }
        }, 0, speedMs, TimeUnit.MILLISECONDS);

        activeSims.put(sessionId, future);
    }

    // ── Live thread state at time t ───────────────────────────────────────
    private List<TickEvent.LiveThread> buildLiveThreads(int t,
            List<GanttSlot> timeline, List<ThreadInput> threads) {
        List<TickEvent.LiveThread> result = new ArrayList<>();
        int readyCount = 0, waitCount = 0;
        final int MAX = 5;

        for (ThreadInput th : threads) {
            List<GanttSlot> slots = timeline.stream()
                    .filter(s -> s.getTid().equals(th.getId()))
                    .sorted(Comparator.comparingInt(GanttSlot::getStart))
                    .toList();

            String rawState = computeRawState(t, th, slots);
            int consumed = slots.stream().filter(s -> s.getEnd() <= t)
                    .mapToInt(s -> s.getEnd() - s.getStart()).sum();
            int activeConsumed = slots.stream()
                    .filter(s -> s.getStart() <= t && s.getEnd() > t)
                    .mapToInt(s -> t - s.getStart()).sum();
            int remaining = Math.max(0, th.getBt() - consumed - activeConsumed);

            // Apply suspend overflow
            String state = rawState;
            if ("READY".equals(rawState)) {
                if (readyCount >= MAX) state = "READY_SUSPENDED";
                else readyCount++;
            } else if ("WAITING".equals(rawState)) {
                if (waitCount >= MAX) state = "WAITING_SUSPENDED";
                else waitCount++;
            }

            result.add(new TickEvent.LiveThread(th.getId(), state, remaining,
                    th.getAt(), th.getBt(), th.getPriority()));
        }
        return result;
    }

    private String computeRawState(int t, ThreadInput th, List<GanttSlot> slots) {
        if (t < th.getAt()) return "NEW";
        boolean running = slots.stream().anyMatch(s -> s.getStart() <= t && s.getEnd() > t);
        if (running) return "RUNNING";
        if (slots.isEmpty()) return t >= th.getAt() ? "READY" : "NEW";
        int maxEnd = slots.stream().mapToInt(GanttSlot::getEnd).max().orElse(0);
        if (t >= maxEnd) return "TERMINATED";
        boolean hasFuture = slots.stream().anyMatch(s -> s.getStart() > t);
        return hasFuture ? "READY" : "WAITING";
    }

    private List<TickEvent.LogEntry> buildLogs(int t, List<GanttSlot> timeline) {
        List<TickEvent.LogEntry> logs = new ArrayList<>();

        timeline.stream().filter(s -> s.getStart() == t)
                .forEach(s -> logs.add(new TickEvent.LogEntry(t,
                        "▷ " + s.getTid() + " entered RUNNING", "run")));

        if (t > 0) {
            Optional<GanttSlot> prev = timeline.stream()
                    .filter(s -> s.getStart() <= t-1 && s.getEnd() > t-1).findFirst();
            Optional<GanttSlot> curr = timeline.stream()
                    .filter(s -> s.getStart() <= t && s.getEnd() > t).findFirst();
            if (prev.isPresent() && curr.isPresent()
                    && !prev.get().getTid().equals(curr.get().getTid())) {
                logs.add(new TickEvent.LogEntry(t,
                        "⇄ Context switch: " + prev.get().getTid()
                                + " → " + curr.get().getTid(), "switch"));
            }
        }

        for (GanttSlot s : timeline) {
            if (s.getEnd() == t) {
                boolean isLast = timeline.stream()
                        .filter(x -> x.getTid().equals(s.getTid()))
                        .noneMatch(x -> x.getEnd() > t);
                if (isLast) {
                    logs.add(new TickEvent.LogEntry(t, "✓ " + s.getTid() + " TERMINATED", "done"));
                }
            }
        }
        return logs;
    }
}