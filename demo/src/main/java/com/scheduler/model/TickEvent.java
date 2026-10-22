package com.scheduler.model;

import java.util.List;

/**
 * Sent over WebSocket every simulated time unit.
 * Contains the current clock, state of every thread, and any log events.
 */
public class TickEvent {

    public enum EventType { TICK, STARTED, CONTEXT_SWITCH, TERMINATED, COMPLETE }

    // ── per-thread live state ──────────────────────────────────────────────
    public static class LiveThread {
        private String id;
        private String state;   // NEW | READY | RUNNING | WAITING | TERMINATED
        private int remaining;
        private int at;
        private int bt;
        private int priority;

        public LiveThread() {}
        public LiveThread(String id, String state, int remaining,
                          int at, int bt, int priority) {
            this.id = id; this.state = state; this.remaining = remaining;
            this.at = at; this.bt = bt; this.priority = priority;
        }

        public String getId()        { return id; }
        public String getState()     { return state; }
        public int getRemaining()    { return remaining; }
        public int getAt()           { return at; }
        public int getBt()           { return bt; }
        public int getPriority()     { return priority; }

        public void setId(String id)          { this.id = id; }
        public void setState(String state)    { this.state = state; }
        public void setRemaining(int r)       { this.remaining = r; }
        public void setAt(int at)             { this.at = at; }
        public void setBt(int bt)             { this.bt = bt; }
        public void setPriority(int p)        { this.priority = p; }
    }

    // ── log entry ─────────────────────────────────────────────────────────
    public static class LogEntry {
        private int t;
        private String msg;
        private String type;   // info | switch | run | done

        public LogEntry() {}
        public LogEntry(int t, String msg, String type) {
            this.t = t; this.msg = msg; this.type = type;
        }

        public int getT()         { return t; }
        public String getMsg()    { return msg; }
        public String getType()   { return type; }

        public void setT(int t)          { this.t = t; }
        public void setMsg(String msg)   { this.msg = msg; }
        public void setType(String type) { this.type = type; }
    }

    // ── fields ────────────────────────────────────────────────────────────
    private EventType type;
    private int currentTime;
    private List<LiveThread> threads;
    private List<LogEntry> newLogs;
    private boolean done;

    public TickEvent() {}

    public EventType getType()              { return type; }
    public int getCurrentTime()             { return currentTime; }
    public List<LiveThread> getThreads()    { return threads; }
    public List<LogEntry> getNewLogs()      { return newLogs; }
    public boolean isDone()                 { return done; }

    public void setType(EventType type)            { this.type = type; }
    public void setCurrentTime(int t)              { this.currentTime = t; }
    public void setThreads(List<LiveThread> th)    { this.threads = th; }
    public void setNewLogs(List<LogEntry> logs)    { this.newLogs = logs; }
    public void setDone(boolean done)              { this.done = done; }
}