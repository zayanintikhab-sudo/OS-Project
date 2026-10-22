package com.scheduler.service;

import com.scheduler.model.*;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Pure Java implementation of all 7 CPU scheduling algorithms.
 * No threads spawned here — just deterministic computation.
 */
@Service
public class SchedulingService {

    // Internal working copy of a thread during computation
    private static class Job {
        String id;
        int at, bt, priority;
        int remaining;
        int startTime = -1;
        int finishTime = 0;
        int waitTime = 0;

        Job(ThreadInput t) {
            id = t.getId(); at = t.getAt(); bt = t.getBt();
            priority = t.getPriority(); remaining = bt;
        }
    }

    // ── Public entry point ────────────────────────────────────────────────
    public ScheduleResponse compute(ScheduleRequest req) {
        List<ThreadInput> inputs = req.getThreads();
        String algo = req.getAlgorithm();
        int quantum = req.getQuantum();

        if (inputs == null || inputs.isEmpty())
            return new ScheduleResponse(List.of(), List.of(), algo, quantum);

        List<GanttSlot> raw = switch (algo) {
            case "FCFS"                      -> fcfs(inputs);
            case "SJF (Non-Preemptive)"      -> sjfNonPreemptive(inputs);
            case "SJF (Preemptive)"          -> sjfPreemptive(inputs);
            case "Round Robin"               -> roundRobin(inputs, quantum);
            case "Priority (Non-Preemptive)" -> priorityNonPreemptive(inputs);
            case "Priority (Preemptive)"     -> priorityPreemptive(inputs);
            case "HRRN"                      -> hrrn(inputs);
            default                          -> fcfs(inputs);
        };

        List<GanttSlot> merged = merge(raw);
        List<ThreadResult> results = buildResults(inputs, merged);

        return new ScheduleResponse(merged, results, algo, quantum);
    }

    // ── FCFS ─────────────────────────────────────────────────────────────
    private List<GanttSlot> fcfs(List<ThreadInput> inputs) {
        List<Job> jobs = inputs.stream()
                .map(Job::new)
                .sorted(Comparator.comparingInt((Job j) -> j.at))
                .collect(Collectors.toList());
        List<GanttSlot> tl = new ArrayList<>();
        int time = 0;
        for (Job j : jobs) {
            if (time < j.at) time = j.at;
            tl.add(new GanttSlot(j.id, time, time + j.bt, j.priority));
            time += j.bt;
        }
        return tl;
    }

    // ── SJF Non-Preemptive ────────────────────────────────────────────────
    private List<GanttSlot> sjfNonPreemptive(List<ThreadInput> inputs) {
        List<Job> jobs = inputs.stream().map(Job::new).collect(Collectors.toList());
        List<GanttSlot> tl = new ArrayList<>();
        int time = 0;
        Set<String> done = new HashSet<>();

        while (done.size() < jobs.size()) {
            final int currentTime = time;
            List<Job> ready = jobs.stream()
                    .filter(j -> !done.contains(j.id) && j.at <= currentTime)
                    .sorted(Comparator.comparingInt((Job j) -> j.bt))
                    .collect(Collectors.toList());

            if (ready.isEmpty()) { time++; continue; }
            Job j = ready.get(0);
            tl.add(new GanttSlot(j.id, time, time + j.bt, j.priority));
            time += j.bt;
            done.add(j.id);
        }
        return tl;
    }

    // ── SJF Preemptive (SRTF) ─────────────────────────────────────────────
    private List<GanttSlot> sjfPreemptive(List<ThreadInput> inputs) {
        List<Job> jobs = inputs.stream().map(Job::new).collect(Collectors.toList());
        List<GanttSlot> tl = new ArrayList<>();
        int time = 0;
        Set<String> done = new HashSet<>();

        while (done.size() < jobs.size()) {
            final int currentTime = time;
            List<Job> ready = jobs.stream()
                    .filter(j -> !done.contains(j.id) && j.at <= currentTime)
                    .sorted(Comparator.comparingInt((Job j) -> j.remaining))
                    .collect(Collectors.toList());

            if (ready.isEmpty()) { time++; continue; }
            Job j = ready.get(0);
            tl.add(new GanttSlot(j.id, time, time + 1, j.priority));
            j.remaining--;
            time++;
            if (j.remaining == 0) done.add(j.id);
        }
        return tl;
    }

    // ── Round Robin ───────────────────────────────────────────────────────
    private List<GanttSlot> roundRobin(List<ThreadInput> inputs, int quantum) {
        List<Job> sorted = inputs.stream()
                .map(Job::new)
                .sorted(Comparator.comparingInt((Job j) -> j.at))
                .collect(Collectors.toList());

        Queue<Job> queue = new LinkedList<>();
        Set<String> inQueue = new HashSet<>();
        List<GanttSlot> tl = new ArrayList<>();
        int time = 0, idx = 0;
        Set<String> done = new HashSet<>();

        while (done.size() < sorted.size()) {
            // Enqueue newly arrived
            while (idx < sorted.size() && sorted.get(idx).at <= time) {
                Job next = sorted.get(idx);
                if (!inQueue.contains(next.id)) { queue.add(next); inQueue.add(next.id); }
                idx++;
            }
            if (queue.isEmpty()) { time++; continue; }

            Job j = queue.poll();
            int exec = Math.min(quantum, j.remaining);
            tl.add(new GanttSlot(j.id, time, time + exec, j.priority));
            time += exec;
            j.remaining -= exec;

            // Enqueue again (newly arrived during this slice)
            while (idx < sorted.size() && sorted.get(idx).at <= time) {
                Job next = sorted.get(idx);
                if (!inQueue.contains(next.id)) { queue.add(next); inQueue.add(next.id); }
                idx++;
            }

            if (j.remaining > 0) queue.add(j);
            else done.add(j.id);
        }
        return tl;
    }

    // ── Priority Non-Preemptive ───────────────────────────────────────────
    private List<GanttSlot> priorityNonPreemptive(List<ThreadInput> inputs) {
        List<Job> jobs = inputs.stream().map(Job::new).collect(Collectors.toList());
        List<GanttSlot> tl = new ArrayList<>();
        int time = 0;
        Set<String> done = new HashSet<>();

        while (done.size() < jobs.size()) {
            final int currentTime = time;
            List<Job> ready = jobs.stream()
                    .filter(j -> !done.contains(j.id) && j.at <= currentTime)
                    .sorted(Comparator.comparingInt((Job j) -> -j.priority)) // higher = better
                    .collect(Collectors.toList());

            if (ready.isEmpty()) { time++; continue; }
            Job j = ready.get(0);
            tl.add(new GanttSlot(j.id, time, time + j.bt, j.priority));
            time += j.bt;
            done.add(j.id);
        }
        return tl;
    }

    // ── Priority Preemptive ───────────────────────────────────────────────
    private List<GanttSlot> priorityPreemptive(List<ThreadInput> inputs) {
        List<Job> jobs = inputs.stream().map(Job::new).collect(Collectors.toList());
        List<GanttSlot> tl = new ArrayList<>();
        int time = 0;
        Set<String> done = new HashSet<>();

        while (done.size() < jobs.size()) {
            final int currentTime = time;
            List<Job> ready = jobs.stream()
                    .filter(j -> !done.contains(j.id) && j.at <= currentTime)
                    .sorted(Comparator.comparingInt((Job j) -> -j.priority))
                    .collect(Collectors.toList());

            if (ready.isEmpty()) { time++; continue; }
            Job j = ready.get(0);
            tl.add(new GanttSlot(j.id, time, time + 1, j.priority));
            j.remaining--;
            time++;
            if (j.remaining == 0) done.add(j.id);
        }
        return tl;
    }

    // ── HRRN ─────────────────────────────────────────────────────────────
    private List<GanttSlot> hrrn(List<ThreadInput> inputs) {
        List<Job> jobs = inputs.stream().map(Job::new).collect(Collectors.toList());
        List<GanttSlot> tl = new ArrayList<>();
        int time = 0;
        Set<String> done = new HashSet<>();

        while (done.size() < jobs.size()) {
            final int currentTime = time;
            List<Job> ready = jobs.stream()
                    .filter(j -> !done.contains(j.id) && j.at <= currentTime)
                    .collect(Collectors.toList());

            if (ready.isEmpty()) { time++; continue; }

            Job best = ready.stream().max(Comparator.comparingDouble(j ->
                    (double)(currentTime - j.at + j.bt) / j.bt
            )).orElse(ready.get(0));

            tl.add(new GanttSlot(best.id, time, time + best.bt, best.priority));
            time += best.bt;
            done.add(best.id);
        }
        return tl;
    }

    // ── Merge consecutive same-thread slots ──────────────────────────────
    private List<GanttSlot> merge(List<GanttSlot> raw) {
        List<GanttSlot> out = new ArrayList<>();
        for (GanttSlot s : raw) {
            if (!out.isEmpty()) {
                GanttSlot last = out.get(out.size() - 1);
                if (last.getTid().equals(s.getTid()) && last.getEnd() == s.getStart()) {
                    out.set(out.size() - 1,
                            new GanttSlot(last.getTid(), last.getStart(), s.getEnd(), last.getPriority()));
                    continue;
                }
            }
            out.add(new GanttSlot(s.getTid(), s.getStart(), s.getEnd(), s.getPriority()));
        }
        return out;
    }

    // ── Build per-thread result metrics ──────────────────────────────────
    private List<ThreadResult> buildResults(List<ThreadInput> inputs, List<GanttSlot> timeline) {
        List<ThreadResult> results = new ArrayList<>();
        for (ThreadInput t : inputs) {
            List<GanttSlot> slots = timeline.stream()
                    .filter(s -> s.getTid().equals(t.getId()))
                    .sorted(Comparator.comparingInt(GanttSlot::getStart))
                    .collect(Collectors.toList());

            if (slots.isEmpty()) continue;

            int ct  = slots.stream().mapToInt(GanttSlot::getEnd).max().orElse(0);
            int tat = ct - t.getAt();
            int rt  = slots.get(0).getStart() - t.getAt();
            int wt  = Math.max(0, tat - t.getBt());

            ThreadResult r = new ThreadResult();
            r.setId(t.getId()); r.setAt(t.getAt()); r.setBt(t.getBt());
            r.setPriority(t.getPriority());
            r.setCt(ct); r.setTat(tat); r.setWt(wt); r.setRt(rt);
            results.add(r);
        }
        return results;
    }
}