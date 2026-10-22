package com.scheduler.model;

public class GanttSlot {
    private String tid;
    private int start;
    private int end;
    private int priority;

    public GanttSlot() {}

    public GanttSlot(String tid, int start, int end, int priority) {
        this.tid = tid;
        this.start = start;
        this.end = end;
        this.priority = priority;
    }

    public String getTid()      { return tid; }
    public int getStart()       { return start; }
    public int getEnd()         { return end; }
    public int getPriority()    { return priority; }

    public void setTid(String tid)          { this.tid = tid; }
    public void setStart(int start)         { this.start = start; }
    public void setEnd(int end)             { this.end = end; }
    public void setPriority(int priority)   { this.priority = priority; }
}