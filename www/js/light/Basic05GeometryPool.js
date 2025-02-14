import {TerrainSubGeometry} from "./TerrainSubGeometry.js";
import {TerrainMultiGeometry} from "./TerrainMultiGeometry.js";
import {GeometryPool} from "./GeometryPool.js";

export class Basic05GeometryPool extends GeometryPool {
    constructor(context, {
        pageSize = 227,
        pageCount = 1000,
        growCoeff = 1.5
    }) {
        super(context)

        this.baseGeometry = new TerrainMultiGeometry({
            context, size: pageCount * pageSize
        })

        this.growCoeff = growCoeff;
        this.pageCount = pageCount;
        this.pageSize = pageSize;
        this.freePages = [];
        for (let i = pageCount - 1; i >= 0; i--) {
            this.freePages.push(i);
        }
    }

    grow() {
        const {pageSize, growCoeff, freePages} = this;
        const prevSize = this.pageCount;
        const newSize = this.pageCount = Math.ceil(prevSize * growCoeff);
        this.baseGeometry.resize(newSize * pageSize);
        for (let i = newSize - 1; i >= prevSize; i--) {
            this.freePages.push(i);
        }
    }

    alloc({
              lastBuffer,
              vertices,
              chunkId
          } = {}) {
        const {freePages, pageSize, baseGeometry} = this;
        const sizeQuads = (vertices.length / 17);
        const sizePages = Math.ceil(sizeQuads / pageSize);
        const lastSize = lastBuffer ? lastBuffer.sizePages : 0;
        let sub = lastBuffer;
        if (!sub) {
            sub = new TerrainSubGeometry({
                pool: this, baseGeometry, sizeQuads, sizePages
            });
        } else {
            sub.sizePages = sizePages;
        }
        if (lastSize === sizePages) {
            sub.setData17(vertices, chunkId);
            return sub;
        }
        const {pages} = sub;
        if (sizePages < lastSize) {
            for (let i = 0; i < lastSize - sizePages; i++) {
                freePages.push(pages.pop());
            }
        } else {
            while (freePages.length < sizePages - lastSize) {
                this.grow();
            }
            for (let i = 0; i < sizePages - lastSize; i++) {
                pages.push(freePages.pop());
            }
        }
        sub.setData17(vertices, chunkId);
        return sub;
    }

    dealloc(buffer) {
        const {freePages} = this;
        const {pages} = buffer;
        if (buffer.pool !== this) {
            return;
        }
        for (let i = pages.length - 1; i >= 0; i--) {
            freePages.push(pages[i]);
        }
        buffer.pool = null;
    }
}