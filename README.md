# Thread Scheduler Visualizer

An interactive CPU/thread scheduling simulator built for an Operating Systems course
project. It computes schedules for the classic scheduling algorithms, renders the
resulting Gantt timeline, and replays the schedule tick-by-tick so the lifecycle of
each thread (NEW → READY → RUNNING → TERMINATED) can be watched as it happens.

## Features

- **Seven scheduling algorithms**
  - FCFS (First Come First Served)
  - SJF — non-preemptive and preemptive (SRTF)
  - Round Robin (configurable time quantum)
  - Priority — non-preemptive and preemptive
  - HRRN (Highest Response Ratio Next)
- **Gantt timeline** of the computed schedule, with adjacent slots of the same thread merged.
- **Per-thread metrics**: completion time, turnaround time, waiting time and response time.
- **Live simulation** streamed over WebSocket (STOMP), one event per simulated time unit,
  with start / pause / resume / stop control and an adjustable tick speed.
- **Runtime mutation** — while a simulation is running you can:
  - add a new thread,
  - kill an existing thread,
  - change a thread's priority,

  and the schedule is recomputed from the current clock and the simulation continues.

## Tech stack

| Layer    | Technology |
|----------|------------|
| Backend  | Java 21, Spring Boot 3.2 (Web + WebSocket), Maven |
| Frontend | React 19, Vite |
| Transport| REST for computation and control, STOMP over WebSocket (SockJS fallback) for live ticks |

## Project layout

```
demo/        Spring Boot backend
  src/main/java/com/scheduler/
    controller/   SchedulerController   — REST endpoints
    service/      SchedulingService     — the scheduling algorithms
                  SimulationService     — tick loop + WebSocket broadcast
    model/        request/response and event DTOs
    websocket/    WebSocketConfig       — STOMP broker setup
frontend/    React + Vite client
```

## Running it

### Backend

```bash
cd demo
./mvnw spring-boot:run        # on Windows: mvnw.cmd spring-boot:run
```

Starts on <http://localhost:8080>. Health check: `GET /api/health`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite serves the UI on <http://localhost:5173> and talks to the backend on port 8080.

## API

All endpoints are under `/api`.

| Method | Endpoint             | Purpose |
|--------|----------------------|---------|
| POST   | `/schedule`          | Compute a schedule and metrics without simulating |
| POST   | `/simulate/start`    | Compute a schedule and begin streaming ticks |
| POST   | `/simulate/pause`    | Pause the tick loop for a session |
| POST   | `/simulate/resume`   | Resume a paused session (optionally at a new speed) |
| POST   | `/simulate/stop`     | Stop and discard a session |
| POST   | `/simulate/add`      | Add a thread mid-run and recompute |
| POST   | `/simulate/kill`     | Terminate a thread mid-run and recompute |
| POST   | `/simulate/priority` | Change a thread's priority mid-run and recompute |
| GET    | `/health`            | Liveness probe |

A thread is described by an id, arrival time (`at`), burst time (`bt`) and `priority`;
Round Robin additionally takes a `quantum`.

### Live events

Connect STOMP to `ws://localhost:8080/ws` and subscribe to
`/topic/simulation/{sessionId}`. Each message carries the current clock, the state and
remaining burst of every thread, and an event type of `TICK`, `STARTED`,
`CONTEXT_SWITCH`, `TERMINATED` or `COMPLETE`.

## Notes

Simulation state is held in memory and keyed by `sessionId`, so restarting the backend
clears all running simulations.
