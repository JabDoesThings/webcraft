import {CubeSym} from "./CubeSym.js";
import {MULTIPLY, Vector} from '../helpers.js';
import glMatrix from "../../vendors/gl-matrix-3.3.min.js"

const {mat3, mat4, vec3}      = glMatrix;
const defaultPivot      = [0.5, 0.5, 0.5];
const defalutCenter     = [0, 0, 0];
const defaultMatrix     = mat4.create();
const tempMatrix        = mat3.create();

const PLANES = {
    up: {
        // axisX , axisY. axisY is flips sign!
        axes  : [[1, 0, 0], /**/ [0, 1, 0]],
        flip  : [1, 1],
        // origin offset realtive center
        offset : [0.5, 0.5, 1.0],
    },
    down: {
        axes  : [[1, 0, 0], /**/ [0, -1, 0]],
        flip  : [-1, -1],
        offset: [0.5, 0.5, 0.0],
    },
    south: {
        axes  : [[1, 0, 0], /**/ [0, 0, 1]],
        flip  : [1, 1],
        offset: [0.5, 0.0, 0.5],
    },
    north: {
        axes  : [[1, 0, 0], /**/ [0, 0, -1]],
        flip  : [-1, 1],
        offset: [0.5, 1.0, 0.5],
    },
    east: {
        axes  : [[0, 1, 0], /**/ [0, 0, 1]],
        flip  : [1, 1],
        offset: [1.0, 0.5, 0.5],
    },
    west: {
        axes  : [[0, 1, 0], /**/ [0, 0, -1]],
        flip  : [-1, 1],
        offset: [-0.0, 0.5, 0.5],
    }
}

export class AABB {

    constructor() {
        this.x_min = 0;
        this.y_min = 0;
        this.z_min = 0;
        this.x_max = 0;
        this.y_max = 0;
        this.z_max = 0;
    }

    /**
     * @type {Vector}
     */
    get size() {
        this._size = this._size || new Vector(0,0,0);

        this._size.x = this.width;
        this._size.y = this.height;
        this._size.z = this.depth;

        return this._size;
    }

    get width() {
        return this.x_max - this.x_min;
    }

    get height() {
        return this.y_max - this.y_min;
    }

    get depth() {
        return this.z_max - this.z_min;
    }

    get center() {
        this._center = this._center ||  new Vector(0,0,0);
        this._center.set(
            this.x_min + this.width / 2,
            this.y_min + this.height / 2,
            this.z_min + this.depth / 2,
        );

        return this._center;
    }

    clone() {
        return new AABB().copyFrom(this);
    }

    copyFrom(aabb) {
        this.x_min = aabb.x_min;
        this.x_max = aabb.x_max;
        this.y_min = aabb.y_min;
        this.y_max = aabb.y_max;
        this.z_min = aabb.z_min;
        this.z_max = aabb.z_max;
        return this;
    }

    pad(padding) {
        this.x_min -= padding;
        this.x_max += padding;
        this.y_min -= padding;
        this.y_max += padding;
        this.z_min -= padding;
        this.z_max += padding;
        return this;
    }

    set(xMin, yMin, zMin, xMax, yMax, zMax) {
        this.x_min = xMin;
        this.y_min = yMin;
        this.z_min = zMin;
        this.x_max = xMax;
        this.y_max = yMax;
        this.z_max = zMax;
        return this;
    }

    setIntersect(aabb1, aabb2) {
        this.x_min = Math.max(aabb1.x_min, aabb2.x_min);
        this.x_max = Math.min(aabb1.x_max, aabb2.x_max);
        this.y_min = Math.max(aabb1.y_min, aabb2.y_min);
        this.y_max = Math.min(aabb1.y_max, aabb2.y_max);
        this.z_min = Math.max(aabb1.z_min, aabb2.z_min);
        this.z_max = Math.min(aabb1.z_max, aabb2.z_max);
        return this;
    }

    isEmpty() {
        return this.x_min >= this.x_max && this.y_min >= this.y_max && this.z_min >= this.z_max;
    }

    applyMatrix(matrix, pivot) {
        if (pivot) {
            this.x_min -= pivot.x;
            this.y_min -= pivot.y;
            this.z_min -= pivot.z;
            this.x_max -= pivot.x;
            this.y_max -= pivot.y;
            this.z_max -= pivot.z;
        }

        const x0 = this.x_min * matrix[0] + this.y_min * matrix[1] + this.z_min * matrix[2];
        const x1 = this.x_max * matrix[0] + this.y_max * matrix[1] + this.z_max * matrix[2];
        const y0 = this.x_min * matrix[3] + this.y_min * matrix[4] + this.z_min * matrix[5];
        const y1 = this.x_max * matrix[3] + this.y_max * matrix[4] + this.z_max * matrix[5];
        const z0 = this.x_min * matrix[6] + this.y_min * matrix[7] + this.z_min * matrix[8];
        const z1 = this.x_max * matrix[6] + this.y_max * matrix[7] + this.z_max * matrix[8];

        this.x_min = Math.min(x0, x1);
        this.x_max = Math.max(x0, x1);
        this.y_min = Math.min(y0, y1);
        this.y_max = Math.max(y0, y1);
        this.z_min = Math.min(z0, z1);
        this.z_max = Math.max(z0, z1);

        if (pivot) {
            this.x_min += pivot.x;
            this.y_min += pivot.y;
            this.z_min += pivot.z;
            this.x_max += pivot.x;
            this.y_max += pivot.y;
            this.z_max += pivot.z;
        }

        return this;
    }

    contains(x, y, z) {
        return x >= this.x_min && x < this.x_max
            && y >= this.y_min && y < this.y_max
            && z >= this.z_min && z < this.z_max;
    }

    intersect(box) {
        return (box.x_min < this.x_max && this.x_min < box.x_max
            && box.y_min < this.y_max && this.y_min < box.y_max
            && box.z_min < this.z_max && this.z_min < box.z_max);
    }

    /**
     * rotated around 0
     * @param sym
     */
    rotate(sym, pivot) {
        if (sym === 0) {
            return this;
        }

        return this.applyMatrix(CubeSym.matrices[sym], pivot);
    }

    toArray(target = []) {
        target[0] = this.x_min;
        target[1] = this.y_min;
        target[2] = this.z_min;

        target[3] = this.x_max;
        target[4] = this.y_max;
        target[5] = this.z_max;

        return target;
    }

    translate(x, y, z) {
        this.x_min += x;
        this.x_max += x;
        this.y_min += y;
        this.y_max += y;
        this.z_min += z;
        this.z_max += z;
        return this;
    }

    addPoint(x, y, z) {
        if(x < this.x_min) this.x_min = x;
        if(x > this.x_max) this.x_max = x;
        if(y < this.y_min) this.y_min = y;
        if(y > this.y_max) this.y_max = y;
        if(z < this.z_min) this.z_min = z;
        if(z > this.z_max) this.z_max = z;
        return this;
    }

    // Expand same for all sides
    expand(x, y, z) {
        this.x_min -= x;
        this.x_max += x;
        this.y_min -= y;
        this.y_max += y;
        this.z_min -= z;
        this.z_max += z;
        return this;
    }

    div(value) {
        this.x_min /= value;
        this.x_max /= value;
        this.y_min /= value;
        this.y_max /= value;
        this.z_min /= value;
        this.z_max /= value;
        return this;
    }

}

export class AABBPool {
    constructor() {
        this._list = [];
    }

    release(elem) {
        this._list.push(elem);
    }

    alloc() {
        return this._list.pop() || new AABB();
    }

    static instance = new AABBPool();
}

export class AABBSideParams {

    constructor(uv, flag, anim, lm = null, axes = null, autoUV) {
        this.uv     = uv;
        this.flag   = flag;
        this.anim   = anim;
        this.lm     = lm;
        this.axes   = axes;
        this.autoUV = autoUV;
    }

}

export function pushTransformed(
    vertices, mat, pivot,
    cx, cz, cy,
    x0, z0, y0,
    ux, uz, uy,
    vx, vz, vy,
    c0, c1, c2, c3,
    r, g, b,
    flags
) {
    pivot = pivot || defaultPivot;
    cx += pivot[0];
    cy += pivot[1];
    cz += pivot[2];
    x0 -= pivot[0];
    y0 -= pivot[1];
    z0 -= pivot[2];

    mat = mat || defaultMatrix;

    let tx = 0;
    let ty = 0;
    let tz = 0;

    // unroll mat4 matrix to mat3 + tx, ty, tz
    if (mat.length === 16) {
        mat3.fromMat4(tempMatrix, mat);

        tx = mat[12];
        ty = mat[14]; // flip
        tz = mat[13]; // flip

        mat = tempMatrix;
    }

    vertices.push(
        cx + x0 * mat[0] + y0 * mat[1] + z0 * mat[2] + tx,
        cz + x0 * mat[6] + y0 * mat[7] + z0 * mat[8] + ty,
        cy + x0 * mat[3] + y0 * mat[4] + z0 * mat[5] + tz,

        ux * mat[0] + uy * mat[1] + uz * mat[2],
        ux * mat[6] + uy * mat[7] + uz * mat[8],
        ux * mat[3] + uy * mat[4] + uz * mat[5],

        vx * mat[0] + vy * mat[1] + vz * mat[2],
        vx * mat[6] + vy * mat[7] + vz * mat[8],
        vx * mat[3] + vy * mat[4] + vz * mat[5],

        c0, c1, c2, c3, r, g, b, flags
    );
}

/**
 * Side params for cube
 * @typedef {{up?: AABBSideParams, down?: AABBSideParams, south?: AABBSideParams, north: AABBSideParams, east?: AABBSideParams, west?: AABBSideParams}} ISideSet
 */

/**
 *
 * @param {number[]} vertices
 * @param {AABB} aabb
 * @param {Vector | number[]} pivot
 * @param {number[]} matrix
 * @param {ISideSet} sides
 * @param {boolean} [autoUV]
 * @param {Vector | number[]} [center] - center wicha AABB is placed, same as [x, y, z] in push transformed
 */
export function pushAABB(vertices, aabb, pivot = null, matrix = null, sides, center) {

    matrix = matrix || defaultMatrix;
    center = center || defalutCenter;
    pivot  = pivot  || defaultPivot; 

    const lm_default      = MULTIPLY.COLOR.WHITE;
    const globalFlags     = 0;
    const x               = center.x;
    const y               = center.y;
    const z               = center.z;

    const size = [
        aabb.width, 
        aabb.depth, // fucking flipped ZY
        aabb.height
    ];

    // distance from center to minimal position
    const dist = [
        aabb.x_min - x,
        aabb.z_min - z, // fucking flipped ZY
        aabb.y_min - y
    ];

    for(const key in sides) {

        if (!(key in PLANES)) {
            continue;
        }

        const {
            /*axes,*/ offset, flip
        } = PLANES[key];

        const {
            uv, flag = 0, anim = 1, autoUV = true
        } = sides[key];

        const lm = sides[key].lm || lm_default;
        const axes = sides[key].axes || PLANES[key].axes;

        let uvSize0;
        let uvSize1;

        if(autoUV) {
            uvSize0 = vec3.dot(axes[0], size) * (uv[2]) * flip[0];
            uvSize1 = -vec3.dot(axes[1], size) * (uv[3]) * flip[1];
        } else {
            uvSize0 = uv[2];
            uvSize1 = -uv[3];
        }

        pushTransformed(
            vertices, matrix, pivot,
            // center
            x, z, y,
            // offset
            size[0] * offset[0] + dist[0],
            size[1] * offset[1] + dist[1],
            size[2] * offset[2] + dist[2],
            // axisx
            size[0] * axes[0][0],
            size[1] * axes[0][1],
            size[2] * axes[0][2],
            // axisY
            size[0] * axes[1][0],
            size[1] * axes[1][1],
            size[2] * axes[1][2],
            // UV center
            uv[0], uv[1],
            // UV size
            uvSize0, uvSize1,
            // tint location
            lm.r, lm.g,
            // animation
            anim,
            // flags
            globalFlags | flag
        );
    }

}
