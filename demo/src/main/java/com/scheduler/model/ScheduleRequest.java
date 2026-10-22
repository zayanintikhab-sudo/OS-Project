package com.scheduler.model;

import java.util.List;

public class ScheduleRequest {
    private List<ThreadInput> threads;
    private String algorithm;
    private int quantum = 2;

    public List<ThreadInput> getThreads()   { return threads; }
    public String getAlgorithm()            { return algorithm; }
    public int getQuantum()                 { return quantum; }

    public void setThreads(List<ThreadInput> t)  { this.threads = t; }
    public void setAlgorithm(String a)           { this.algorithm = a; }
    public void setQuantum(int q)                { this.quantum = q; }
}