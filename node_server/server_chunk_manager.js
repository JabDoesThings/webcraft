import {ServerChunk} from "./server_chunk.js";

import {getChunkAddr} from "../www/js/chunk.js";
import {SpiralGenerator, Vector, VectorCollector} from "../www/js/helpers.js";
import {ServerClient} from "../www/js/server_client.js";

export const MAX_Y_MARGIN = 3;

export class ServerChunkManager {

    constructor(world) {
        this.world = world;
        this.all = new VectorCollector();
    }

    add(chunk) {
        this.all.set(chunk.addr, chunk);
    }

    async get(addr, add_if_not_exists) {
        let chunk = this.all.get(addr);
        if(chunk) {
            return chunk;
        }
        if(!add_if_not_exists) {
            return null;
        }
        chunk = new ServerChunk(this.world, addr);
        this.add(chunk);
        await chunk.load();
        return chunk;
    }

    remove(addr) {
        this.all.delete(addr);
    }

    // Check player visible chunks
    checkPlayerVisibleChunks(player, force) {

        player.chunk_addr = getChunkAddr(player.state.pos);

        if (force || !player.chunk_addr_o.equal(player.chunk_addr)) {

            const chunk_render_dist = player.state.chunk_render_dist;

            let margin              = Math.max(chunk_render_dist + 1, 1);
            let spiral_moves_3d     = SpiralGenerator.generate3D(new Vector(margin, MAX_Y_MARGIN, margin));
            let nearby = {
                chunk_render_dist:  chunk_render_dist,
                added:              [], // чанки, которые надо подгрузить
                deleted:            [] // чанки, которые надо выгрузить
            };

            let added_vecs = new VectorCollector();

            for(let sm of spiral_moves_3d) {
                let addr = player.chunk_addr.add(sm.pos);
                if(addr.y >= 0) {
                    added_vecs.set(addr, true);
                    let new_info = {
                        addr: addr,
                        has_modifiers: this.world.chunkHasModifiers(addr) // у чанка есть модификации?
                    };
                    if(!player.chunks.has(addr)) {
                        nearby.added.push(new_info);
                    }
                }
            }

            if(player.nearby && player.nearby.added.length > 0) {
                for(let added of player.nearby.added) {
                    if(!added_vecs.has(added.addr)) {
                        nearby.deleted.push(added.addr);
                    }
                }
            }

            console.log('new: ' + nearby.added.length + '; delete: ' + nearby.deleted.length);
            player.nearby = nearby;

            let packets = [{
                name: ServerClient.CMD_NEARBY_CHUNKS,
                data: nearby
            }];
            this.world.sendSelected(packets, [player.session.user_id], []);

            player.chunk_addr_o = player.chunk_addr;

        }
    }

}