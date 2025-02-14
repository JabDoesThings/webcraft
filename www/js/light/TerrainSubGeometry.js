export class TerrainSubGeometry {
    constructor({baseGeometry, pool, sizeQuads = 0, sizePages = 0}) {
        this.baseGeometry = baseGeometry;
        this.pool = pool;
        this.glOffsets = [];
        this.glCounts = [];
        this.pages = [];
        this.sizeQuads = sizeQuads;
        this.sizePages = sizePages;
    }

    setData17(vertices, chunkId) {
        this.sizeQuads = this.size = vertices.length / 17;
        const {baseGeometry, pages, glOffsets, glCounts} = this;
        const {pageSize} = this.pool;
        glOffsets.length = glCounts.length = 0;
        for (let i = 0; i < this.sizePages; i++) {
            const start = i * pageSize;
            const finish = Math.min(this.sizeQuads, (i + 1) * pageSize);
            if (i > 0 && pages[i] === pages[i - 1] + 1) {
                glCounts[glCounts.length - 1] += finish - start;
            } else {
                glOffsets.push(pages[i] * pageSize);
                glCounts.push(finish - start);
            }
            baseGeometry.update17(pages[i] * pageSize,
                vertices, start, finish - start, chunkId);
        }
    }

    destroy() {
        if (!this.pool) {
            return;
        }
        this.pool.dealloc(this);
    }
}