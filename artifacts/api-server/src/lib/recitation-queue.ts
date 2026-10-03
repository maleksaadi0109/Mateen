type WorkItem = { id: string; run: () => Promise<void> };

export class SingleWorkerQueue {
  private readonly pending = new Map<string, WorkItem>();
  private activeId: string | null = null;

  constructor(private readonly capacity: number) {}

  get size(): number {
    return this.pending.size + (this.activeId ? 1 : 0);
  }

  get active(): boolean {
    return this.activeId !== null;
  }

  canAccept(id?: string): boolean {
    if (id && (id === this.activeId || this.pending.has(id))) return true;
    return this.size < this.capacity;
  }

  enqueue(id: string, run: () => Promise<void>): boolean {
    if (id === this.activeId || this.pending.has(id)) return true;
    if (!this.canAccept()) return false;
    this.pending.set(id, { id, run });
    this.drain();
    return true;
  }

  cancelPending(id: string): boolean {
    return this.pending.delete(id);
  }

  private drain(): void {
    if (this.activeId) return;
    const next = this.pending.values().next().value as WorkItem | undefined;
    if (!next) return;
    this.pending.delete(next.id);
    this.activeId = next.id;
    void Promise.resolve()
      .then(next.run)
      .catch(() => undefined)
      .finally(() => {
        this.activeId = null;
        this.drain();
      });
  }
}