package com.scheduler.model;

public class ThreadInput {
    private String id;
    private int at;   // Arrival Time
    private int bt;   // Burst Time
    private int priority;

    public ThreadInput() {}

    public ThreadInput(String id, int at, int bt, int priority) {
        this.id = id;
        this.at = at;
        this.bt = bt;
        this.priority = priority;
    }

    public String getId()        { return id; }
    public int getAt()           { return at; }
    public int getBt()           { return bt; }
    public int getPriority()     { return priority; }

    public void setId(String id)         { this.id = id; }
    public void setAt(int at)            { this.at = at; }
    public void setBt(int bt)            { this.bt = bt; }
    public void setPriority(int priority){ this.priority = priority; }
}