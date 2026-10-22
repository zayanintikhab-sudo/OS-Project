package com.scheduler.model;

public class ThreadResult {
    private String id;
    private int at;
    private int bt;
    private int priority;
    private int ct;   // Completion Time
    private int tat;  // Turnaround Time
    private int wt;   // Waiting Time
    private int rt;   // Response Time

    public ThreadResult() {}

    public String getId()        { return id; }
    public int getAt()           { return at; }
    public int getBt()           { return bt; }
    public int getPriority()     { return priority; }
    public int getCt()           { return ct; }
    public int getTat()          { return tat; }
    public int getWt()           { return wt; }
    public int getRt()           { return rt; }

    public void setId(String id)          { this.id = id; }
    public void setAt(int at)             { this.at = at; }
    public void setBt(int bt)             { this.bt = bt; }
    public void setPriority(int priority) { this.priority = priority; }
    public void setCt(int ct)             { this.ct = ct; }
    public void setTat(int tat)           { this.tat = tat; }
    public void setWt(int wt)             { this.wt = wt; }
    public void setRt(int rt)             { this.rt = rt; }
}