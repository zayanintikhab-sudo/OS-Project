package com.scheduler.controller;

import com.scheduler.model.*;
import com.scheduler.service.SchedulingService;
import com.scheduler.service.SimulationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class SchedulerController {

    @Autowired private SchedulingService schedulingService;
    @Autowired private SimulationService simulationService;

    private final Map<String, List<ThreadInput>> sessionThreads = new ConcurrentHashMap<>();

    @PostMapping("/schedule")
    public ResponseEntity<ScheduleResponse> schedule(@RequestBody ScheduleRequest req) {
        return ResponseEntity.ok(schedulingService.compute(req));
    }

    @PostMapping("/simulate/start")
    public ResponseEntity<ScheduleResponse> startSimulation(@RequestBody SimulateRequest req) {
        ScheduleRequest schedReq = new ScheduleRequest();
        schedReq.setThreads(req.getThreads());
        schedReq.setAlgorithm(req.getAlgorithm());
        schedReq.setQuantum(req.getQuantum());
        ScheduleResponse schedule = schedulingService.compute(schedReq);
        int speedMs = req.getSpeedMs() > 0 ? req.getSpeedMs() : 600;
        sessionThreads.put(req.getSessionId(), new ArrayList<>(req.getThreads()));
        simulationService.start(req.getSessionId(), schedule, req.getThreads(), speedMs);
        return ResponseEntity.ok(schedule);
    }

    @PostMapping("/simulate/pause")
    public ResponseEntity<Map<String, String>> pauseSimulation(@RequestBody Map<String, String> body) {
        String sessionId = body.get("sessionId");
        if (sessionId != null) simulationService.pause(sessionId);
        return ResponseEntity.ok(Map.of("status", "paused"));
    }

    @PostMapping("/simulate/resume")
    public ResponseEntity<Map<String, String>> resumeSimulation(@RequestBody ResumeRequest req) {
        if (req.getSessionId() != null)
            simulationService.resume(req.getSessionId(), req.getSpeedMs() > 0 ? req.getSpeedMs() : 600);
        return ResponseEntity.ok(Map.of("status", "resumed"));
    }

    @PostMapping("/simulate/stop")
    public ResponseEntity<Map<String, String>> stopSimulation(@RequestBody Map<String, String> body) {
        String sessionId = body.get("sessionId");
        if (sessionId != null) simulationService.stop(sessionId);
        return ResponseEntity.ok(Map.of("status", "stopped"));
    }

    @PostMapping("/simulate/kill")
    public ResponseEntity<ScheduleResponse> killThread(@RequestBody ThreadMutateRequest req) {
        List<ThreadInput> threads = sessionThreads.get(req.getSessionId());
        if (threads == null) return ResponseEntity.notFound().build();
        threads.replaceAll(t -> {
            if (t.getId().equals(req.getThreadId())) {
                KillableThread kt = new KillableThread(t);
                kt.setKilled(true);
                return kt;
            }
            return t;
        });
        return recomputeAndRestart(req.getSessionId(), threads, req.getAlgorithm(), req.getQuantum(), req.getSpeedMs(), req.getCurrentTime());
    }

    @PostMapping("/simulate/add")
    public ResponseEntity<ScheduleResponse> addThread(@RequestBody AddThreadRequest req) {
        List<ThreadInput> threads = sessionThreads.computeIfAbsent(req.getSessionId(), k -> new ArrayList<>());
        boolean exists = threads.stream().anyMatch(t -> t.getId().equals(req.getNewThread().getId()));
        if (exists) return ResponseEntity.badRequest().build();
        threads.add(req.getNewThread());
        return recomputeAndRestart(req.getSessionId(), threads, req.getAlgorithm(), req.getQuantum(), req.getSpeedMs(), req.getCurrentTime());
    }

    @PostMapping("/simulate/priority")
    public ResponseEntity<ScheduleResponse> changePriority(@RequestBody PriorityChangeRequest req) {
        List<ThreadInput> threads = sessionThreads.get(req.getSessionId());
        if (threads == null) return ResponseEntity.notFound().build();
        threads.replaceAll(t -> {
            if (t.getId().equals(req.getThreadId())) {
                return new ThreadInput(t.getId(), t.getAt(), t.getBt(), req.getNewPriority());
            }
            return t;
        });
        return recomputeAndRestart(req.getSessionId(), threads, req.getAlgorithm(), req.getQuantum(), req.getSpeedMs(), req.getCurrentTime());
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok", "service", "Thread Scheduler Backend"));
    }

    private ResponseEntity<ScheduleResponse> recomputeAndRestart(
            String sessionId, List<ThreadInput> threads,
            String algorithm, int quantum, int speedMs, int currentTime) {
        ScheduleRequest req = new ScheduleRequest();
        req.setThreads(threads);
        req.setAlgorithm(algorithm != null ? algorithm : "FCFS");
        req.setQuantum(quantum > 0 ? quantum : 2);
        ScheduleResponse schedule = schedulingService.compute(req);
        simulationService.updateSchedule(sessionId, schedule, threads, currentTime, speedMs > 0 ? speedMs : 600);
        return ResponseEntity.ok(schedule);
    }

    public static class SimulateRequest extends ScheduleRequest {
        private String sessionId; private int speedMs;
        public String getSessionId(){return sessionId;} public int getSpeedMs(){return speedMs;}
        public void setSessionId(String s){sessionId=s;} public void setSpeedMs(int s){speedMs=s;}
    }
    public static class ResumeRequest {
        private String sessionId; private int speedMs;
        public String getSessionId(){return sessionId;} public int getSpeedMs(){return speedMs;}
        public void setSessionId(String s){sessionId=s;} public void setSpeedMs(int s){speedMs=s;}
    }
    public static class ThreadMutateRequest {
        private String sessionId,threadId,algorithm; private int quantum,speedMs,currentTime;
        public String getSessionId(){return sessionId;} public String getThreadId(){return threadId;}
        public String getAlgorithm(){return algorithm;} public int getQuantum(){return quantum;}
        public int getSpeedMs(){return speedMs;} public int getCurrentTime(){return currentTime;}
        public void setSessionId(String s){sessionId=s;} public void setThreadId(String s){threadId=s;}
        public void setAlgorithm(String s){algorithm=s;} public void setQuantum(int q){quantum=q;}
        public void setSpeedMs(int s){speedMs=s;} public void setCurrentTime(int t){currentTime=t;}
    }
    public static class AddThreadRequest {
        private String sessionId,algorithm; private int quantum,speedMs,currentTime; private ThreadInput newThread;
        public String getSessionId(){return sessionId;} public String getAlgorithm(){return algorithm;}
        public int getQuantum(){return quantum;} public int getSpeedMs(){return speedMs;}
        public int getCurrentTime(){return currentTime;} public ThreadInput getNewThread(){return newThread;}
        public void setSessionId(String s){sessionId=s;} public void setAlgorithm(String s){algorithm=s;}
        public void setQuantum(int q){quantum=q;} public void setSpeedMs(int s){speedMs=s;}
        public void setCurrentTime(int t){currentTime=t;} public void setNewThread(ThreadInput t){newThread=t;}
    }
    public static class PriorityChangeRequest {
        private String sessionId,threadId,algorithm; private int newPriority,quantum,speedMs,currentTime;
        public String getSessionId(){return sessionId;} public String getThreadId(){return threadId;}
        public String getAlgorithm(){return algorithm;} public int getNewPriority(){return newPriority;}
        public int getQuantum(){return quantum;} public int getSpeedMs(){return speedMs;}
        public int getCurrentTime(){return currentTime;}
        public void setSessionId(String s){sessionId=s;} public void setThreadId(String s){threadId=s;}
        public void setAlgorithm(String s){algorithm=s;} public void setNewPriority(int p){newPriority=p;}
        public void setQuantum(int q){quantum=q;} public void setSpeedMs(int s){speedMs=s;}
        public void setCurrentTime(int t){currentTime=t;}
    }
    public static class KillableThread extends ThreadInput {
        private boolean killed;
        public KillableThread(ThreadInput t){super(t.getId(),t.getAt(),t.getBt(),t.getPriority());}
        public boolean isKilled(){return killed;} public void setKilled(boolean k){killed=k;}
    }
}