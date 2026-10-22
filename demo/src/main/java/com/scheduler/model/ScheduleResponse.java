package com.scheduler.model;

import java.util.List;

public class ScheduleResponse {
    private List<GanttSlot> timeline;
    private List<ThreadResult> results;
    private String algorithm;
    private int quantum;

    public ScheduleResponse() {}

    public ScheduleResponse(List<GanttSlot> timeline, List<ThreadResult> results,
                             String algorithm, int quantum) {
        this.timeline = timeline;
        this.results = results;
        this.algorithm = algorithm;
        this.quantum = quantum;
    }

    public List<GanttSlot> getTimeline()        { return timeline; }
    public List<ThreadResult> getResults()       { return results; }
    public String getAlgorithm()                 { return algorithm; }
    public int getQuantum()                      { return quantum; }

    public void setTimeline(List<GanttSlot> t)   { this.timeline = t; }
    public void setResults(List<ThreadResult> r) { this.results = r; }
    public void setAlgorithm(String a)           { this.algorithm = a; }
    public void setQuantum(int q)                { this.quantum = q; }
}