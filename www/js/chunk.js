import {Vector, VectorCollector} from "./helpers.js";
import GeometryTerrain from "./geometry_terrain.js";
import {newTypedBlocks} from "./typed_blocks3.js";
import {Sphere} from "./frustum.js";
import {BLOCK} from "./blocks.js";
import {AABB} from './core/AABB.js';
import {CubeTexturePool} from "./light/CubeTexturePool.js";

export const CHUNK_SIZE_X                   = 16;
export const CHUNK_SIZE_Y                   = 40;
export const CHUNK_SIZE_Z                   = 16;
export const CHUNK_SIZE                     = CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z;
export const CHUNK_SIZE_Y_MAX               = 4096;
export const MAX_CAVES_LEVEL                = 256;
export const ALLOW_NEGATIVE_Y               = true;

// Возвращает адрес чанка по глобальным абсолютным координатам
export function getChunkAddr(x, y, z, v = null) {
    if(x instanceof Vector || typeof x == 'object') {
        v = y;

        y = x.y;
        z = x.z;
        x = x.x;
    }
    //
    v = v || new Vector();
    v.x = Math.floor(x / CHUNK_SIZE_X);
    v.y = Math.floor(y / CHUNK_SIZE_Y);
    v.z = Math.floor(z / CHUNK_SIZE_Z);
    // Fix negative zero
    if(v.x == 0) {v.x = 0;}
    if(v.y == 0) {v.y = 0;}
    if(v.z == 0) {v.z = 0;}
    return v;
}

// Creates a new chunk
export class Chunk {

    getChunkManager() {
        return this.chunkManager;
    }

    constructor(addr, modify_list, chunkManager) {

        this.addr                       = new Vector(addr); // относительные координаты чанка
        this.seed                       = chunkManager.world.info.seed;

        // Run webworker method
        chunkManager.postWorkerMessage(['createChunk', [
            {
                addr:           this.addr,
                seed:           this.seed,
                modify_list:    modify_list || []
            }
        ]]);

        //
        this.tblocks                    = null;
        this.size                       = new Vector(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z); // размеры чанка
        this.coord                      = this.addr.mul(this.size);
        this.id                         = this.addr.toHash();

        // Light
        this.lightTex                   = null;
        this.lightData                  = null;
        this.lightMats                  = new Map();

        // Objects & variables
        this.inited                     = false;
        this.dirty                      = true;
        this.buildVerticesInProgress    = false;
        this.vertices_length            = 0;
        this.vertices                   = new Map();
        this.verticesList               = [];
        this.fluid_blocks               = [];
        this.gravity_blocks             = [];
        this.in_frustum                 = false; // в данный момент отрисован на экране
        this.rendered                   = 0;
        // save ref on chunk manager
        // strictly after post message, for avoid crash
        this.chunkManager               = chunkManager;
        this.aabb                       = new AABB();
        this.aabb.set(
            this.coord.x,
            this.coord.y,
            this.coord.z,
            this.coord.x + this.size.x,
            this.coord.y + this.size.y,
            this.coord.z + this.size.z
        );

        this._dataTextureOffset = 0;
        this._dataTexture = null;
        this._dataTextureDirty = false;
    }

    // onBlocksGenerated ... Webworker callback method
    onBlocksGenerated(args) {
        const chunkManager = this.getChunkManager();
        if (!chunkManager) {
            return;
        }
        this.tblocks = newTypedBlocks(this.coord, this.size);
        chunkManager.dataWorld.addChunk(this);
        if(args.tblocks) {
            this.tblocks.restoreState(args.tblocks);
        }
        this.inited = true;
        this.initLights();
    }

    // onVerticesGenerated ... Webworker callback method
    onVerticesGenerated(args) {
        this.vertices_args = args;
        this.need_apply_vertices = true;
        if(!this.dirt_colors) {
            this.dirt_colors = args.dirt_colors;
        }
        if(!this.map) {
            this.map = args.map;
        }
    }

    onLightGenerated(args) {
        const cm = this.getChunkManager();
        const arrClass = cm.lightTexFormat === 'rgb565unorm' ? Uint16Array: Uint8Array;
        this.lightData = args.lightmap_buffer ? new arrClass(args.lightmap_buffer) : null;
        if (this.lightTex !== null) {
            this.lightTex.update(this.lightData)
        }
    }

    initLights() {
        if(!this.chunkManager.use_light) {
            return false;
        }

        const { size } = this;
        const sz = size.x * size.y * size.z;
        const light_buffer = new ArrayBuffer(sz);
        const light_source = new Uint8Array(light_buffer);

        let ind = 0;
        let prev_block_id = Infinity;
        let light_power_number = 0;
        let block_material = null;

        const {cx, cy, cz, cw } = this.dataChunk;
        const { id } = this.tblocks;

        for (let y = 0; y < size.y; y++)
            for (let z = 0; z < size.z; z++)
                for (let x = 0; x < size.x; x++) {
                    const index = cx * x + cy * y + cz * z + cw;
                    const block_id = id[index];
                    if(block_id !== prev_block_id) {
                        block_material = BLOCK.BLOCK_BY_ID.get(block_id)
                        if(block_material) {
                            light_power_number = block_material.light_power_number;
                        } else {
                            console.error(`Block not found ${block_id}`);
                        }
                        prev_block_id = block_id;
                    }
                    light_source[ind++] = light_power_number;
                }
        this.getChunkManager().postLightWorkerMessage(['createChunk',
            {addr: this.addr, size: this.size, light_buffer}]);
    }

    getLightTexture(render) {
        const cm = this.getChunkManager();
        if (!this.lightData || !cm) {
            return null;
        }
        if (!cm.lightPool) {
            cm.lightPool = new CubeTexturePool(render,{
                defWidth: CHUNK_SIZE_X + 2,
                defHeight: CHUNK_SIZE_Z + 2,
                defDepth: (CHUNK_SIZE_Y + 2) * 2,
                type: cm.lightTexFormat,
                filter: 'linear',
            });
        }

        if (!this.lightTex) {
            const lightTex = this.lightTex = cm.lightPool.alloc({
                width: this.size.x + 2,
                height: this.size.z + 2,
                depth: (this.size.y + 2) * 2,
                type: cm.lightTexFormat,
                filter: 'linear',
                data: this.lightData
            })
            this._dataTextureDirty = true;
        }

        return this.lightTex;
    }

    getDataTextureOffset() {
        if (!this._dataTexture) {
            const cm = this.getChunkManager();
            cm.chunkDataTexture.add(this);
        }

        return this._dataTextureOffset;
    }

    prepareRender(render) {
        if (!render) {
            return;
        }
        //TODO: if dist < 100?
        this.getLightTexture(render);

        if (!this._dataTexture) {
            const cm = this.getChunkManager();
            cm.chunkDataTexture.add(this);
        }

        if (this._dataTextureDirty) {
            this._dataTexture.writeChunkData(this);
        }
    }

    drawBufferVertices(render, resource_pack, group, mat, vertices) {
        const v = vertices, key = v.key;
        let texMat = resource_pack.materials.get(key);
        if(!texMat) {
            texMat = mat.getSubMat(resource_pack.getTexture(v.texture_id).texture);
            resource_pack.materials.set(key, texMat);
        }
        mat = texMat;
        let dist = Game.player.lerpPos.distance(this.coord);
        render.batch.setObjectDrawer(render.chunk);
        if(this.lightData && dist < 108) {
            // in case light of chunk is SPECIAL
            this.getLightTexture(render);
            if (this.lightTex) {
                const base = this.lightTex.baseTexture || this.lightTex;
                if (base._poolLocation <= 0) {
                    mat = this.lightMats.get(key);
                    if (!mat) {
                        mat = texMat.getLightMat(this.lightTex);
                        this.lightMats.set(key, mat);
                    }
                }
            }
        }
        render.chunk.draw(v.buffer, mat, this);
        return true;
    }

    // Apply vertices
    applyVertices() {
        let chunkManager = this.getChunkManager();
        const args = this.vertices_args;
        delete(this['vertices_args']);
        this.need_apply_vertices                = false;
        this.buildVerticesInProgress            = false;
        this.timers                             = args.timers;
        this.gravity_blocks                     = args.gravity_blocks;
        this.fluid_blocks                       = args.fluid_blocks;
        chunkManager.vertices_length_total      -= this.vertices_length;
        this.vertices_length                    = 0;
        // Delete old WebGL buffers
        for(let [key, v] of this.vertices) {
            v.buffer.customFlag = true;
        }

        const chunkLightId = this.getDataTextureOffset();
        // Add chunk to renderer
        this.verticesList.length = 0;
        for(let [key, v] of Object.entries(args.vertices)) {
            if(v.list.length > 0) {
                let temp = key.split('/');
                this.vertices_length  += v.list.length / GeometryTerrain.strideFloats;
                let lastBuffer = this.vertices.get(key);
                if (lastBuffer) { lastBuffer = lastBuffer.buffer }
                v.resource_pack_id    = temp[0];
                v.material_group      = temp[1];
                v.texture_id          = temp[2];
                v.key                 = key;
                v.buffer              = chunkManager.bufferPool.alloc({
                    lastBuffer,
                    vertices: v.list,
                    chunkId: chunkLightId
                });
                if (lastBuffer && v.buffer !== lastBuffer) {
                    lastBuffer.destroy();
                }
                v.buffer.customFlag = false;
                v.rpl = null;
                this.vertices.set(key, v);
                this.verticesList.push(v);
                delete(v.list);
            }
        }
        let oldKeys = [];
        for (let [key, v] of this.vertices) {
            if (v.customFlag) {
                v.destroy();
                oldKeys.push(key);
            }
        }
        for (let i = 0; i< oldKeys.length; i++) {
            this.vertices.delete(oldKeys);
        }
        if(this.vertices_length == 0) {
            // @todo
        }
        chunkManager.vertices_length_total += this.vertices_length;
        this.dirty = false;
    }

    // Destruct chunk
    destruct() {
        let chunkManager = this.getChunkManager();
        if (!chunkManager) {
            return;
        }
        this.chunkManager = null;
        chunkManager.dataWorld.removeChunk(this);
        // destroy buffers
        for(let [_, v] of this.vertices) {
            if(v.buffer) {
                v.buffer.destroy();
            }
        }
        const { lightTex } = this;
        if (lightTex) {
            chunkManager.lightPool.dealloc(lightTex);
        }
        this.lightTex = null;
        // run webworker method
        chunkManager.destruct_chunks_queue.add(this.addr);
        // chunkManager.postWorkerMessage(['destructChunk', [this.addr]]);
        // chunkManager.postLightWorkerMessage(['destructChunk', [this.addr]]);
        // remove particles mesh
        const PARTICLE_EFFECTS_ID = 'particles_effects_' + this.addr.toHash();
        Game.render.meshes.remove(PARTICLE_EFFECTS_ID, Game.render);
    }

    // Build vertices
    buildVertices() {
        if(this.buildVerticesInProgress) {
            return;
        }
        this.buildVerticesInProgress = true;
        // run webworker method
        this.getChunkManager().postWorkerMessage(['buildVertices', {
            addrs: [this.addr],
            offsets: [this.getDataTextureOffset()]
        }]);
        return true;
    }

    // Get the type of the block at the specified position.
    // Mostly for neatness, since accessing the array
    // directly is easier and faster.
    getBlock(x, y, z, v) {
        if(!this.inited) {
            return this.getChunkManager().DUMMY;
        }
        x -= this.coord.x;
        y -= this.coord.y;
        z -= this.coord.z;
        if(x < 0 || y < 0 || z < 0 || x >= this.size.x || y >= this.size.y || z >= this.size.z) {
            return this.getChunkManager().DUMMY;
        }
        if(v instanceof Vector) {
            v.set(x, y, z);
        } else {
            v = new Vector(x, y, z);
        }
        let block = this.tblocks.get(v);
        return block;
    }

    // setBlock
    setBlock(x, y, z, item, is_modify, power, rotate, entity_id, extra_data) {
        x -= this.coord.x;
        y -= this.coord.y;
        z -= this.coord.z;
        if(x < 0 || y < 0 || z < 0 || x >= this.size.x || y >= this.size.y || z >= this.size.z) {
            return;
        };
        // fix rotate
        if(rotate && typeof rotate === 'object') {
            rotate = new Vector(rotate).roundSelf(1);
        } else {
            rotate = new Vector(0, 0, 0);
        }
        // fix power
        if(typeof power === 'undefined' || power === null) {
            power = 100;
        }
        if(power <= 0) {
            return;
        }
        let update_vertices = true;
        let chunkManager = this.getChunkManager();
        //
        if(!is_modify) {
            let oldLight = 0;
            let material = BLOCK.BLOCK_BY_ID.get(item.id);
            let pos = new Vector(x, y, z);
            let tblock           = this.tblocks.get(pos);

            if (this.chunkManager.use_light) {
                oldLight = tblock.material.light_power_number;
            }

            this.tblocks.delete(pos);

            tblock.id            = material.id;
            tblock.extra_data    = extra_data;
            tblock.entity_id     = entity_id;
            tblock.power         = power;
            tblock.rotate        = rotate;
            tblock.falling       = !!material.gravity;
            update_vertices         = true;
            if (this.chunkManager.use_light) {
                const light         = material.light_power_number;
                if (oldLight !== light) {
                    chunkManager.postLightWorkerMessage(['setBlock', { addr: this.addr,
                        x:          x + this.coord.x,
                        y:          y + this.coord.y,
                        z:          z + this.coord.z,
                        light_source: light}]);
                }
            }
        }
        // Run webworker method
        if(update_vertices) {
            let set_block_list = [];
            set_block_list.push({
                pos:        new Vector(x + this.coord.x, y + this.coord.y, z + this.coord.z),
                type:       item,
                is_modify:  is_modify,
                power:      power,
                rotate:     rotate,
                extra_data: extra_data
            });
            // Принудительная перерисовка соседних чанков
            let update_neighbours = [];
            if(x == 0) update_neighbours.push(new Vector(-1, 0, 0));
            if(x == this.size.x - 1) update_neighbours.push(new Vector(1, 0, 0));
            if(y == 0) update_neighbours.push(new Vector(0, -1, 0));
            if(y == this.size.y - 1) update_neighbours.push(new Vector(0, 1, 0));
            if(z == 0) update_neighbours.push(new Vector(0, 0, -1));
            if(z == this.size.z - 1) update_neighbours.push(new Vector(0, 0, 1));
            // diagonal
            if(x == 0 && z == 0) update_neighbours.push(new Vector(-1, 0, -1));
            if(x == this.size.x - 1 && z == 0) update_neighbours.push(new Vector(1, 0, -1));
            if(x == 0 && z == this.size.z - 1) update_neighbours.push(new Vector(-1, 0, 1));
            if(x == this.size.x - 1 && z == this.size.z - 1) update_neighbours.push(new Vector(1, 0, 1));
            // Добавляем выше и ниже
            let update_neighbours2 = [];
            for(let i = 0; i < update_neighbours.length; i++) {
                const update_neighbour = update_neighbours[i];
                update_neighbours2.push(update_neighbour.add(new Vector(0, -1, 0)));
                update_neighbours2.push(update_neighbour.add(new Vector(0, 1, 0)));
            }
            update_neighbours.push(...update_neighbours2);
            let updated_chunks = new VectorCollector();
            updated_chunks.set(this.addr, true);
            let _chunk_addr = new Vector(0, 0, 0);
            for(let i = 0; i < update_neighbours.length; i++) {
                const update_neighbour = update_neighbours[i];
                let pos = new Vector(x, y, z).addSelf(this.coord).addSelf(update_neighbour);
                _chunk_addr = getChunkAddr(pos, _chunk_addr);
                // чтобы не обновлять один и тот же чанк дважды
                if(!updated_chunks.has(_chunk_addr)) {
                    updated_chunks.set(_chunk_addr);
                    set_block_list.push({
                        pos,
                        type:       null,
                        is_modify:  is_modify,
                        power:      power,
                        rotate:     rotate
                    });
                }
            }
            chunkManager.postWorkerMessage(['setBlock', set_block_list]);
        }
    }

    //
    updateInFrustum(render) {
        if(!this.frustum_geometry) {
            this.frustum_geometry = Chunk.createFrustumGeometry(this.coord, this.size);
        }
        this.in_frustum = render.frustum.intersectsGeometryArray(this.frustum_geometry);
        return this.in_frustum;
    }

    //
    static createFrustumGeometry(coord, size) {
        let frustum_geometry    = [];
        let box_radius          = size.x;
        let sphere_radius       = (Math.sqrt(3) * box_radius / 2) * 1.05;
        frustum_geometry.push(new Sphere(coord.add(new Vector(size.x / 2, size.y / 4, size.z / 2)), sphere_radius));
        frustum_geometry.push(new Sphere(coord.add(new Vector(size.x / 2, size.y - size.y / 4, size.z / 2)), sphere_radius));
        return frustum_geometry;
    }

}