import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from "./chunk.js";
import { DIRECTION, DIRECTION_BIT, ROTATE, TX_CNT, Vector, Vector4 } from './helpers.js';
import { ResourcePackManager } from './resource_pack_manager.js';
import { Resources } from "./resources.js";
import { CubeSym } from "./core/CubeSym.js";
import { AABB } from './core/AABB.js';

import { default as StyleStairs } from './block_style/stairs.js';

export const TRANS_TEX                      = [4, 12];
export const WATER_BLOCKS_ID                = [200, 202];
export const INVENTORY_STACK_DEFAULT_SIZE   = 64;
export const POWER_NO                       = 0;

// Свойства, которые могут сохраняться в БД
export const ITEM_DB_PROPS                  = ['count', 'entity_id', 'power', 'extra_data', 'rotate'];
export const ITEM_INVENTORY_PROPS           = ['count', 'entity_id', 'power'];
export const ITEM_INVENTORY_KEY_PROPS       = ['entity_id', 'power'];

let aabb = new AABB();
let shapePivot = new Vector(.5, .5, .5);

export let NEIGHB_BY_SYM = {};
NEIGHB_BY_SYM[DIRECTION.FORWARD] = 'NORTH';
NEIGHB_BY_SYM[DIRECTION.BACK] = 'SOUTH';
NEIGHB_BY_SYM[DIRECTION.LEFT] = 'WEST';
NEIGHB_BY_SYM[DIRECTION.RIGHT] = 'EAST';
NEIGHB_BY_SYM[DIRECTION.DOWN] = 'DOWN';
NEIGHB_BY_SYM[DIRECTION.UP] = 'UP';

// BLOCK PROPERTIES:
// fluid (bool)                 - Is fluid
// gravity (bool)               - May fall
// id (int)                     - Unique ID
// instrument_id (string)       - Unique code of instrument type
// inventory_icon_id (int)      - Position in inventory atlas
// max_in_stack (int)           - Max count in inventory or other stack
// name (string)                - Unique name
// passable (float)             - Passable value 0...1
// selflit (bool)               - ?
// sound (string)               - Resource ID
// spawnable (bool)             - Cannot be /give for player
// style (string)               - used for drawing style (cube, fence, ladder, plant, pane, sign, slab, stairs)
// tags (string[])              - Array of string tags
// texture (array | function)   - ?
// transparent (bool)           - Not cube

class Block {

    constructor() {}

}

class Block_Material {

    static materials = {
        data: null,
        checkBlock: async function(resource_pack, block) {
            if(block.material && block.material instanceof Block_Material) {
                return;
            }
            if(!this.data) {
                this.data = await Resources.loadMaterials();
            }
            if(!block.material || !('id' in block.material)) {
                throw 'error_block_has_no_material|' + resource_pack.id + '.' + block.name;
            }
            //
            if(block.item?.instrument_id && !this.data.instruments[block.item.instrument_id]) {
                throw 'error_unknown_instrument|' + block.item.instrument_id;
            }
            //
            const block_material_id = block.material.id;
            if(!this.data.list[block_material_id]) {
                throw 'error_invalid_instrument|' + block_material_id;
            }
            block.material = new Block_Material(this.data.list[block_material_id]);
            block.material.id = block_material_id;
            if(typeof block.mining_time !== 'undefined') {
                block.material.mining.time = block.mining_time
            }
        }
    };

    constructor(data) {
        Object.assign(this, JSON.parse(JSON.stringify(data)));
    }

    /**
     * Возвращает время, необходимое для того, чтобы разбить блок
     * @param { Object } instrument
     * @param { Bool } force Фиксированное и ускоренное разбитие (например в режиме креатива)
     * @return float
     */
    getMiningTime(instrument, force) {
        let mining_time = this.mining.time;
        if(force) {
            mining_time = 0;
        } else if(instrument && instrument.material) {
            const instrument_id = instrument.material.item?.instrument_id;
            if(instrument_id) {
                if(this.mining.instruments.indexOf(instrument_id) >= 0) {
                    const instrument_boost = instrument.material.material.mining.instrument_boost;
                    if(typeof instrument_boost !== 'undefined' && !isNaN(instrument_boost)) {
                        mining_time = Math.round((mining_time / instrument_boost) * 100) / 100;
                    }
                }
            }
        }
        return mining_time;
    }

}

export class BLOCK {

    static list                     = new Map();
    static styles                   = new Map();
    static spawn_eggs               = [];
    static ao_invisible_blocks      = [];
    static resource_pack_manager    = null;
    static max_id                   = 0;
    static MASK_BIOME_BLOCKS        = [];
    static MASK_COLOR_BLOCKS        = [];

    static getBlockTitle(block) {
        if(!block || !('id' in block)) {
            return '';
        }
        let mat = null;
        if('name' in block && 'title' in block) {
            mat = block;
        } else {
            mat = BLOCK.fromId(block.id);
        }
        let resp = mat.name;
        if(mat.title) {
            resp += ` (${mat.title})`;
        }
        resp = resp.replaceAll('_', ' ');
        return resp;
    }

    static getLightPower(material) {
        if (!material) {
            return 0;
        }
        let val = 0;
        if(material.light_power) {
            val = Math.floor(material.light_power.a / 16.0);
        } else if (!material.transparent) {
            val = 127;
        }
        return val + (material.visible_for_ao ? 128 : 0);
    }

    // Return flat index of chunk block
    static getIndex(x, y, z) {
        if(x instanceof Vector || typeof x == 'object') {
            y = x.y;
            z = x.z;
            x = x.x;
        }
        let index = (CHUNK_SIZE_X * CHUNK_SIZE_Z) * y + (z * CHUNK_SIZE_X) + x;
        return index;
    }

    // Return new simplified item
    static convertItemToDBItem(item) {
        if(!item || !('id' in item)) {
            return null;
        }
        const resp = {
            id: item.id
        };
        for(let k of ITEM_DB_PROPS) {
            let v = item[k];
            if(v !== undefined && v !== null) {
                resp[k] = v;
            }
        }
        return resp;
    }

    // Return new simplified item
    static convertItemToInventoryItem(item, b) {
        if(!item || !('id' in item) || item.id < 0) {
            return null;
        }
        const resp = {
            id: item.id
        };
        if('count' in item) {
            item.count = Math.floor(item.count);
        }
        // fix old invalid instruments power
        if(b && 'power' in b && b.power > 0) {
            if(!item.power) {
                item.power = b.power;
            }
        }
        for(let k of ITEM_INVENTORY_PROPS) {
            if(b) {
                if(k in b) {
                    if(k == 'power' && b.power == 0) {
                        continue;
                    }
                } else {
                    if(k != 'count') {
                        continue;
                    }
                }
            }
            let v = item[k];
            if(v !== undefined && v !== null) {
                resp[k] = v;
            }
        }
        return resp;
    }

    //
    static getBlockIndex(x, y, z, v = null) {
        if(x instanceof Vector) {
            y = x.y;
            z = x.z;
            x = x.x;
        }
        let f = (v, m) => {
            if(v < 0) v++;
            v = v % m;
            if(v == 0) v = 0;
            if(v < 0) v *= -1;
            return v;
        };
        if(v) {
            v.x = f(x, CHUNK_SIZE_X);
            v.y = f(y, CHUNK_SIZE_Y);
            v.z = f(z, CHUNK_SIZE_Z);
        } else {
            v = new Vector(
                f(x, CHUNK_SIZE_X),
                f(y, CHUNK_SIZE_Y),
                f(z, CHUNK_SIZE_Z),
            );
        }
        if(x < 0) v.x = CHUNK_SIZE_X - 1 - v.x;
        if(y < 0) v.y = CHUNK_SIZE_Y - 1 - v.y;
        if(z < 0) v.z = CHUNK_SIZE_Z - 1 - v.z;
        return v;
    }

    // Call before setBlock
    static makeExtraData(block, pos, orientation) {
        block = BLOCK.BLOCK_BY_ID.get(block.id);
        let extra_data = null;
        let is_trapdoor = block.tags.indexOf('trapdoor') >= 0;
        let is_stairs = block.tags.indexOf('stairs') >= 0;
        let is_door = block.tags.indexOf('door') >= 0;
        let is_slab = block.is_layering && block.layering.slab;
        if(is_trapdoor || is_stairs || is_door || is_slab) {
            extra_data = {
                point: pos.point ? new Vector(pos.point.x, pos.point.y, pos.point.z) : new Vector(0, 0, 0)
            };
            // Trapdoor
            if(is_trapdoor) {
                extra_data.opened = false;
            }
            // Door
            if(is_door) {
                extra_data.opened = false;
                extra_data.left = false;
                if(!pos.point) {
                    pos.point = new Vector(0, 0, 0);
                }
                switch(orientation.x) {
                    case ROTATE.S: {
                        extra_data.left = pos.point.x < .5;
                        break;
                    }
                    case ROTATE.N: {
                        extra_data.left = pos.point.x >= .5;
                        break;
                    }
                    case ROTATE.W: {
                        extra_data.left = pos.point.z >= .5;
                        break;
                    }
                    case ROTATE.E: {
                        extra_data.left = pos.point.z < .5;
                        break;
                    }
                }
            }
            if(pos.n.y == 1) {
                extra_data.point.y = 0;
            } else if(pos.n.y == -1) {
                extra_data.point.y = 1;
            }
        } else if(block.extra_data) {
            extra_data = JSON.parse(JSON.stringify(block.extra_data));
            extra_data = BLOCK.calculateExtraData(extra_data, pos);
        }
        return extra_data;
    }

    // Execute calculated extra_data fields
    static calculateExtraData(extra_data, pos) {
        if('calculated' in extra_data) {
            const calculated = extra_data.calculated;
            delete(extra_data.calculated);
            for(let g of calculated) {
                if(!('name' in g)) {
                    throw 'error_generator_name_not_set';
                }
                switch(g.type) {
                    case 'pos': {
                        extra_data[g.name] = new Vector(pos);
                        break;
                    }
                    case 'random_int': {
                        if(!('min_max' in g)) {
                            throw 'error_generator_min_max_not_set';
                        }
                        extra_data[g.name] = Math.floor(Math.random() * (g.min_max[1] - g.min_max[0] + 1) + g.min_max[0]);
                        break;
                    }
                    case 'random_item': {
                        if(!('items' in g)) {
                            throw 'error_generator_items_not_set';
                        }
                        extra_data[g.name] = g.items.length > 0 ? g.items[g.items.length * Math.random() | 0] : null;
                    }
                }
            }
        }
        return extra_data;
    }

    // Returns a block structure for the given id.
    static fromId(id) {
        if(this.BLOCK_BY_ID.has(id)) {
            return this.BLOCK_BY_ID.get(id);
        }
        console.error('Warning: id missing in BLOCK ' + id);
        return this.DUMMY;
    }

    // Returns a block structure for the given id.
    static fromName(name) {
        if(name.indexOf(':') >= 0) {
            name = name.split(':')[1].toUpperCase();
        }
        if(this.hasOwnProperty(name)) {
            return this[name]
        }
        console.error('Warning: name missing in BLOCK ' + name);
        return this.DUMMY;
    }

    // Возвращает True если блок является растением
    static isPlants(id) {
        let b = this.fromId(id);
        return b && !!b.planting;
    }

    // Can replace
    static canReplace(block_id, extra_data, replace_with_block_id) {
        if(block_id == 0) {
            return true;
        }
        if([BLOCK.GRASS.id, BLOCK.STILL_WATER.id, BLOCK.FLOWING_WATER.id, BLOCK.STILL_LAVA.id, BLOCK.FLOWING_LAVA.id, BLOCK.CLOUD.id, BLOCK.TALL_GRASS.id, BLOCK.TALL_GRASS_TOP.id].indexOf(block_id) >= 0) {
            return true;
        }
        let block = BLOCK.BLOCK_BY_ID.get(block_id);
        if(block.is_fluid) {
            return true;
        }
        if(block.is_layering) {
            let height = extra_data ? (extra_data.height ? parseFloat(extra_data.height) : 1) : block.height;
            return !isNaN(height) && height == block.height && block_id != replace_with_block_id;
        }
        return false;
    }

    // Блок может быть уничтожен водой
    static destroyableByWater(block) {
        return block.planting || block.id == this.AIR.id;
    }

    // Стартовый игровой инвентарь
    static getStartInventory() {
        let blocks = [
            Object.assign({count: 5}, this.RED_MUSHROOM),
            Object.assign({count: 64}, this.SAND),
            Object.assign({count: 6}, this.BOOKCASE),
            Object.assign({count: 20}, this.GLOWSTONE),
            Object.assign({count: 4}, this.TEST)
        ];
        for(let key of Object.keys(blocks)) {
            let b = blocks[key];
            delete(b.texture);
            blocks[key] = b;
        }
        return blocks;
    }

    //
    static getBlockStyleGroup(block) {
        let group = 'regular';
        // make vertices array
        if(WATER_BLOCKS_ID.indexOf(block.id) >= 0 || (block.tags && (block.tags.indexOf('alpha') >= 0))) {
            // если это блок воды или облако
            group = 'doubleface_transparent';
        } else if(block.style == 'pane' || block.tags.indexOf('glass') >= 0) {
            group = 'transparent';
        } else if(block.id == 649 ||
            block.tags.indexOf('leaves') >= 0 ||
            block.style == 'planting' || block.style == 'chain' || block.style == 'ladder' ||
            block.style == 'door' || block.style == 'redstone' || block.style == 'pot' || block.style == 'lantern' ||
            block.style == 'azalea' || block.style == 'bamboo' || block.style == 'campfire' || block.style == 'cocoa'
            ) {
            group = 'doubleface';
        }
        return group;
    }

    static reset() {
        BLOCK.spawn_eggs             = [];
        BLOCK.ao_invisible_blocks    = [];
        BLOCK.list                   = new Map();
        BLOCK.BLOCK_BY_ID            = new Map();
        BLOCK.BLOCK_BY_TAGS          = new Map();
    }

    // parseBlockStyle...
    static parseBlockStyle(block) {
        return block.hasOwnProperty('style') ? block.style : 'default';
    }

    // parseBlockTransparent...
    static parseBlockTransparent(block) {
        let transparent = block.hasOwnProperty('transparent') && !!block.transparent;
        if(block.style && block.style == 'stairs') {
            transparent = true;
        }
        return transparent;
    }

    // add
    static async add(resource_pack, block) {
        // Check duplicate ID
        if(!('name' in block) || !('id' in block)) {
            throw 'error_invalid_block';
        }
        const existing_block = this.BLOCK_BY_ID.has(block.id) ? this.fromId(block.id) : null;
        const replace_block = existing_block && (block.name == existing_block.name);
        const original_props = Object.keys(block);
        if(existing_block) {
            if(replace_block) {
                for(let prop_name in existing_block) {
                    if(original_props.indexOf(prop_name) < 0) {
                        block[prop_name] = existing_block[prop_name];
                    }
                }
            } else {
                console.error('Duplicate block id ', block.id, block);
            }
        }
        // Check block material
        await Block_Material.materials.checkBlock(resource_pack, block);
        if(!block.sound) {
            if(block.id > 0) {
                if(!block.item) {
                    let material_id = null;
                    if(['stone', 'grass', 'wood', 'glass', 'sand'].indexOf(block.material.id) >= 0) {
                        material_id = block.material.id;
                    } else {
                        switch(block.material.id) {
                            case 'ice':
                            case 'netherite':
                            case 'terracota': {
                                material_id = 'stone';
                                break;
                            }
                            case 'plant':
                            case 'dirt':
                            case 'leaves': {
                                material_id = 'grass';
                                break;
                            }
                            default: {
                                // console.log(block.name, block.material.id);
                            }
                        }
                    }
                    if(material_id) {
                        block.sound = `madcraft:block.${material_id}`;
                    }
                }
            }
        }
        //
        block.has_window        = !!block.window;
        block.style             = this.parseBlockStyle(block);
        block.tags              = block?.tags || [];
        block.power             = (('power' in block) && !isNaN(block.power) && block.power > 0) ? block.power : POWER_NO;
        block.group             = this.getBlockStyleGroup(block);
        block.selflit           = block.hasOwnProperty('selflit') && !!block.selflit;
        block.deprecated        = block.hasOwnProperty('deprecated') && !!block.deprecated;
        block.transparent       = this.parseBlockTransparent(block);
        block.is_water          = block.is_fluid && WATER_BLOCKS_ID.indexOf(block.id) >= 0;
        block.is_jukebox        = block.tags.indexOf('jukebox') >= 0;
        block.is_mushroom_block = block.tags.indexOf('mushroom_block') >= 0;
        block.is_button         = block.tags.indexOf('button') >= 0;
        block.is_sapling        = block.tags.indexOf('sapling') >= 0;
        block.is_battery        = ['car_battery'].indexOf(block?.item?.name) >= 0;
        block.is_layering       = !!block.layering;
        block.planting          = ('planting' in block) ? block.planting : (block.material.id == 'plant');
        block.resource_pack     = resource_pack;
        block.material_key      = BLOCK.makeBlockMaterialKey(resource_pack, block);
        block.can_rotate        = 'can_rotate' in block ? block.can_rotate : block.tags.filter(x => ['trapdoor', 'stairs', 'door'].indexOf(x) >= 0).length > 0;
        block.tx_cnt            = BLOCK.calcTxCnt(block);
        block.uvlock            = !('uvlock' in block) ? true : false;
        block.invisible_for_cam = block.material.id == 'plant' && block.style == 'planting';
        // rotate_by_pos_n_plus
        if(block.tags.indexOf('rotate_by_pos_n_plus') >= 0) {
            block.tags.push('rotate_by_pos_n');
        }
        //
        if(block.planting && !('inventory_style' in block)) {
            block.inventory_style = 'extruder';
        }
        // Set default properties
        let default_properties = {
            light:              null,
            texture_animations: null,
            passable:           0,
            spawnable:          true,
            max_in_stack:       INVENTORY_STACK_DEFAULT_SIZE
        };
        for(let [k, v] of Object.entries(default_properties)) {
            if(!block.hasOwnProperty(k)) {
                block[k] = v;
            }
        }
        // Add to ao_invisible_blocks list
        if(block.planting || block.style == 'fence' || block.style == 'wall' || block.style == 'pane' || block.style == 'ladder' || block.light_power || block.tags.indexOf('no_drop_ao') >= 0) {
            if(this.ao_invisible_blocks.indexOf(block.id) < 0) {
                this.ao_invisible_blocks.push(block.id);
            }
        }
        // Calculate in last time, after all init procedures
        block.visible_for_ao = BLOCK.visibleForAO(block);
        block.light_power_number = BLOCK.getLightPower(block);
        // Append to collections
        if(replace_block) {
            original_props.push('resource_pack');
            original_props.push('material_key');
            original_props.push('tx_cnt');
            for(let prop_name of original_props) {
                existing_block[prop_name] = block[prop_name];
            }
            block = existing_block;
        } else {
            this[block.name] = block;
            BLOCK.BLOCK_BY_ID.set(block.id, block);
            this.list.set(block.id, block);
        }
        // After add works
        // Add spawn egg
        if(block.spawn_egg && BLOCK.spawn_eggs.indexOf(block.id) < 0) {
            BLOCK.spawn_eggs.push(block.id);
        }
        if(block.tags.indexOf('mask_biome') >= 0 && BLOCK.MASK_BIOME_BLOCKS.indexOf(block.id) < 0) {
            BLOCK.MASK_BIOME_BLOCKS.push(block.id)
        }
        if(block.tags.indexOf('mask_color') >= 0 && BLOCK.MASK_COLOR_BLOCKS.indexOf(block.id) < 0) {
            BLOCK.MASK_COLOR_BLOCKS.push(block.id)
        }
        // Parse tags
        for(let tag of block.tags) {
            if(!this.BLOCK_BY_TAGS.has(tag)) {
                this.BLOCK_BY_TAGS.set(tag, new Map());
            }
            this.BLOCK_BY_TAGS.get(tag).set(block.id, block);
        }
        // Max block ID
        if(block.id > this.max_id) {
            this.max_id = block.id;
        }
    }

    // Make material key
    static makeBlockMaterialKey(resource_pack, material) {
        let mat_group = material.group;
        let texture_id = 'default';
        if(typeof material.texture == 'object' && 'id' in material.texture) {
            texture_id = material.texture.id;
        }
        return `${resource_pack.id}/${mat_group}/${texture_id}`;
    }

    // Return tx_cnt from resource pack texture
    static calcTxCnt(material) {
        let tx_cnt = TX_CNT;
        if (typeof material.texture === 'object' && 'id' in material.texture) {
            let tex = material.resource_pack.conf.textures[material.texture.id];
            if(tex && 'tx_cnt' in tex) {
                tx_cnt = tex.tx_cnt;
            }
        } else {
            let tex = material.resource_pack.conf.textures['default'];
            if(tex && 'tx_cnt' in tex) {
                tx_cnt = tex.tx_cnt;
            }
        }
        return tx_cnt;
    }

    // getAll
    static getAll() {
        return this.list;
    }

    static isEgg(block_id) {
        return BLOCK.spawn_eggs.indexOf(block_id) >= 0;
    }

    // Возвращает координаты текстуры с учетом информации из ресурс-пака
    static calcMaterialTexture(material, dir, width, height, block, force_tex) {
        const tx_cnt = material.tx_cnt;
        let texture = force_tex || material.texture;
        // Stages
        if(block && material.stage_textures && block && block.extra_data) {
            if('stage' in block.extra_data) {
                let stage = block.extra_data.stage;
                stage = Math.max(stage, 0);
                stage = Math.min(stage, material.stage_textures.length - 1);
                texture = material.stage_textures[stage];
            }
        }
        // Mushroom block
        if(material.is_mushroom_block) {
            let t = block?.extra_data?.t;
            if(block && t) {
                texture = material.texture.down;
                if(dir == DIRECTION.UP && (t >> DIRECTION_BIT.UP) % 2 != 0) texture = material.texture.side;
                if(dir == DIRECTION.DOWN && (t >> DIRECTION_BIT.DOWN) % 2 != 0) texture = material.texture.side;
                if(dir == DIRECTION.WEST && (t >> DIRECTION_BIT.WEST) % 2 != 0) texture = material.texture.side;
                if(dir == DIRECTION.EAST && (t >> DIRECTION_BIT.EAST) % 2 != 0) texture = material.texture.side;
                if(dir == DIRECTION.NORTH && (t >> DIRECTION_BIT.NORTH) % 2 != 0) texture = material.texture.side;
                if(dir == DIRECTION.SOUTH && (t >> DIRECTION_BIT.SOUTH) % 2 != 0) texture = material.texture.side;
            } else {
                texture = material.texture.down;
            }
        }
        let c = this.calcTexture(texture, dir, tx_cnt);
        if(width && width < 1) {
            c[2] *= width;
        }
        if(height && height < 1) {
            c[1] += 0.5 / tx_cnt - height / tx_cnt / 2;
            c[3] *= height;
        }
        /*if(dir == DIRECTION.UP) {
            c[2] *= -1;
            c[3] *= -1;
        }*/
        //if(dir == DIRECTION.NORTH || dir == DIRECTION.WEST) {
            //c[2] *= -1;
            //c[3] *= -1;
        //}
        return c;
    }

    // getAnimations...
    static getAnimations(material, side) {
        if(!material.texture_animations) {
            return 0;
        }
        if(side in material.texture_animations) {
            return material.texture_animations[side];
        } else if('side' in material.texture_animations) {
            return material.texture_animations['side'];
        }
        return 0;
    }

    // Возвращает координаты текстуры
    static calcTexture(c, dir, tx_cnt) {
        if(typeof tx_cnt == 'undefined') {
            tx_cnt = TX_CNT;
        }
        if (c instanceof Array) {
            // do nothing
        } else if(c instanceof Function) {
            c = c(dir);
        } else if (typeof c === 'object' && c !== null) {
            let prop = null;
            switch(dir) {
                case DIRECTION.UP: {prop = 'up'; break;}
                case DIRECTION.DOWN: {prop = 'down'; break;}
                case DIRECTION.LEFT: {prop = 'west'; break;}
                case DIRECTION.RIGHT: {prop = 'east'; break;}
                case DIRECTION.FORWARD: {prop = 'north'; break;}
                case DIRECTION.BACK: {prop = 'south'; break;}
            }
            if(c.hasOwnProperty(prop)) {
                c = c[prop];
            } else if(c.hasOwnProperty('side')) {
                c = c.side;
            } else {
                throw 'Invalid texture prop `' + prop + '`';
            }
        }
        if(!c) {
            debugger;
        }
        const flags = c[2] | 0;
        return [
            (c[0] + 0.5) / tx_cnt,
            (c[1] + 0.5) / tx_cnt,
            ((flags & 1) != 0) ? - 1 / tx_cnt : 1 / tx_cnt,
            ((flags & 2) != 0)  ? - 1 / tx_cnt : 1 / tx_cnt
        ];
    }

    // Функция определяет, отбрасывает ли указанный блок тень
    static visibleForAO(block) {
        if(!block) return false;
        if(typeof block == 'undefined') return false;
        let block_id = block;
        if(typeof block !== 'number') {
            block_id = block.id;
        }
        if(block_id < 1) return false;
        if(this.ao_invisible_blocks.indexOf(block_id) >= 0) return false;
        return true;
    }

    // Return inventory icon pos
    static getInventoryIconPos(
        inventory_icon_id,
        inventory_image_size = 2048,
        frameSize = 128
    ) {
        const w = frameSize;
        const h = frameSize;
        const icons_per_row = inventory_image_size / w;

        return new Vector4(
            (inventory_icon_id % icons_per_row) * w,
            Math.floor(inventory_icon_id / icons_per_row) * h,
            w,
            h
        );
    }

    //
    static registerStyle(style) {
        let reg_info = style.getRegInfo();
        for(let style of reg_info.styles) {
            BLOCK.styles.set(style, reg_info);
        }
    }

    //
    static getCardinalDirection(vec3) {
        if (!vec3) {
            return 0;
        }
        if (vec3.x && !(vec3.y * vec3.z)) {
            if(vec3.x >= 0 && vec3.x < 48 && vec3.x == Math.round(vec3.x)) {
                return vec3.x;
            }
        }
        if(vec3) {
            if(vec3.z >= 45 && vec3.z < 135) {
                return ROTATE.E;
            } else if(vec3.z >= 135 && vec3.z < 225) {
                return ROTATE.S;
            } else if(vec3.z >= 225 && vec3.z < 315) {
                return ROTATE.W;
            } else {
                return ROTATE.N;
            }
        }
        return CubeSym.ID; //was E
    }

    static isOnCeil(block) {
        return block.extra_data && block.extra_data?.point?.y >= .5; // на верхней части блока (перевернутая ступенька, слэб)
    }

    static isOpened(block) {
        return !!(block.extra_data && block.extra_data.opened);
    }

    static canFenceConnect(block) {
        return block.id > 0 && (!block.properties.transparent || block.properties.style == 'fence' || block.properties.style == 'wall' || block.properties.style == 'pane');
    }

    static canWallConnect(block) {
        return block.id > 0 && (!block.properties.transparent || block.properties.style == 'wall' || block.properties.style == 'pane' || block.properties.style == 'fence');
    }

    static canPaneConnect(block) {
        return this.canWallConnect(block);
    };

    static canRedstoneDustConnect(block) {
        return block.id > 0 && (block.properties && 'redstone' in block.properties);
    }

    static autoNeighbs(chunkManager, pos, cardinal_direction, neighbours) {
        const mat = CubeSym.matrices[cardinal_direction];
        if (!neighbours) {
            return {
                NORTH: chunkManager.getBlock(pos.x + mat[2], pos.y + mat[5], pos.z + mat[8]),
                SOUTH: chunkManager.getBlock(pos.x - mat[2], pos.y - mat[5], pos.z - mat[8]),
                EAST: chunkManager.getBlock(pos.x + mat[0], pos.y + mat[3], pos.z + mat[6]),
                WEST: chunkManager.getBlock(pos.x - mat[0], pos.y - mat[3], pos.z - mat[6])
            }
        }
        return {
            WEST: neighbours[NEIGHB_BY_SYM[CubeSym.dirAdd(cardinal_direction, DIRECTION.LEFT)]],
            EAST: neighbours[NEIGHB_BY_SYM[CubeSym.dirAdd(cardinal_direction, DIRECTION.RIGHT)]],
            NORTH: neighbours[NEIGHB_BY_SYM[CubeSym.dirAdd(cardinal_direction, DIRECTION.FORWARD)]],
            SOUTH: neighbours[NEIGHB_BY_SYM[CubeSym.dirAdd(cardinal_direction, DIRECTION.BACK)]],
        }
    }

    // getShapes
    static getShapes(pos, b, world, for_physic, expanded, neighbours) {
        let shapes = []; // x1 y1 z1 x2 y2 z2
        const material = b.properties;
        if(!material) {
            return shapes;
        }
        let f = !!expanded ? .001 : 0;
        if(!material.passable && !material.planting) {
            switch(material.style) {
                case 'fence': {
                    let height = for_physic ? 1.5 : 1;
                    //
                    let n = this.autoNeighbs(world.chunkManager, pos, 0, neighbours);
                    // world.chunkManager.getBlock(pos.x, pos.y, pos.z);
                    // South z--
                    if(this.canFenceConnect(n.SOUTH)) {
                        shapes.push([.5-2/16, 5/16, 0, .5+2/16, height, .5+2/16]);
                    }
                    // North z++
                    if(this.canFenceConnect(n.NORTH)) {
                        shapes.push([.5-2/16, 5/16, .5-2/16, .5+2/16, height, 1]);
                    }
                    // West x--
                    if(this.canFenceConnect(n.WEST)) {
                        shapes.push([0, 5/16, .5-2/16, .5+2/16, height, .5+2/16]);
                    }
                    // East x++
                    if(this.canFenceConnect(n.EAST)) {
                        shapes.push([.5-2/16, 5/16, .5-2/16, 1, height, .5+2/16]);
                    }
                    // Central
                    shapes.push([
                        .5-2/16, 0, .5-2/16,
                        .5+2/16, height, .5+2/16
                    ]);
                    break;
                }
                case 'wall': {
                    const CENTER_WIDTH      = 8 / 16;
                    const CONNECT_WIDTH     = 6 / 16;
                    const CONNECT_HEIGHT    = 14 / 16;
                    const CONNECT_BOTTOM    = 0 / 16;
                    const CONNECT_X         = 6 / 16;
                    const CONNECT_Z         = 8 / 16;
                    const height            = for_physic ? 1.5 : CONNECT_HEIGHT;
                    //
                    let zconnects = 0;
                    let xconnects = 0;
                    //
                    let n = this.autoNeighbs(world.chunkManager, pos, 0, neighbours);
                    // world.chunkManager.getBlock(pos.x, pos.y, pos.z);
                    // South z--
                    if(this.canWallConnect(n.SOUTH)) {
                        shapes.push([.5-CONNECT_X/2, CONNECT_BOTTOM, 0, .5-CONNECT_X/2 + CONNECT_X, height, CONNECT_Z/2]);
                        zconnects++;
                    }
                    // North z++
                    if(this.canWallConnect(n.NORTH)) {
                        if(zconnects) {
                            shapes.pop();
                            shapes.push([.5-CONNECT_X/2, CONNECT_BOTTOM, 0, .5-CONNECT_X/2 + CONNECT_X, height, 1]);
                        } else {
                            shapes.push([.5-CONNECT_X/2, CONNECT_BOTTOM, .5+CONNECT_Z/2, .5-CONNECT_X/2 + CONNECT_X, height, .5+CONNECT_Z]);
                        }
                        zconnects++;
                    }
                    // West x--
                    if(this.canWallConnect(n.WEST)) {
                        shapes.push([0, CONNECT_BOTTOM, .5-CONNECT_X/2, CONNECT_Z/2, height, .5-CONNECT_X/2 + CONNECT_X]);
                        xconnects++;
                    }
                    // East x++
                    if(this.canWallConnect(n.EAST)) {
                        if(xconnects) {
                            shapes.pop();
                            shapes.push([0, CONNECT_BOTTOM, .5-CONNECT_X/2, 1, height, .5-CONNECT_X/2 + CONNECT_X]);
                        } else {
                            shapes.push([1 - CONNECT_Z/2, CONNECT_BOTTOM, .5-CONNECT_X/2, 1, height, .5-CONNECT_X/2 + CONNECT_X]);
                        }
                        xconnects++;
                    }
                    if((zconnects == 2 && xconnects == 0) || (zconnects == 0 && xconnects == 2)) {
                        // do nothing
                    } else {
                        // Central
                        shapes.push([
                            .5-CENTER_WIDTH/2, 0, .5-CENTER_WIDTH/2,
                            .5+CENTER_WIDTH/2, Math.max(height, 1), .5+CENTER_WIDTH/2
                        ]);
                    }
                    break;
                }
                case 'thin': {
                    // F R B L
                    let cardinal_direction = b.getCardinalDirection();
                    shapes.push(aabb.set(0, 0, .5-1/16, 1, 1, .5+1/16).rotate(cardinal_direction, shapePivot).toArray());
                    break;
                }
                case 'pane': {
                    let height = 1;
                    let w = 2/16;
                    let w2 = w/2;
                    //
                    let n = this.autoNeighbs(world.chunkManager, pos, 0, neighbours);
                    // world.chunkManager.getBlock(pos.x, pos.y, pos.z);
                    let con_s = this.canPaneConnect(n.SOUTH);
                    let con_n = this.canPaneConnect(n.NORTH);
                    let con_w = this.canPaneConnect(n.WEST);
                    let con_e = this.canPaneConnect(n.EAST);
                    let remove_center = con_s || con_n || con_w || con_e;
                    //
                    if(con_s && con_n) {
                        // remove_center = true;
                        shapes.push([.5-w2, 0, 0, .5+w2, height, .5+.5]);
                    } else {
                        // South z--
                        if(con_s) {
                            shapes.push([.5-w2, 0, 0, .5+w2, height, .5+w2]);
                        }
                        // North z++
                        if(con_n) {
                            shapes.push([.5-w2,0, .5-w2, .5+w2, height, 1]);
                        }
                    }
                    if(con_w && con_e) {
                        // remove_center = true;
                        shapes.push([0, 0, .5-w2, 1, height, .5+w2]);
                    } else {
                        // West x--
                        if(con_w) {
                            shapes.push([0, 0, .5-w2, .5+w2, height, .5+w2]);
                        }
                        // East x++
                        if(con_e) {
                            shapes.push([.5-w2, 0, .5-w2, 1, height, .5+w2]);
                        }
                    }
                    // Central
                    if(!remove_center) {
                        shapes.push([.5-w2, 0, .5-w2, .5+w2, height, .5+w2]);
                    }
                    break;
                }
                case 'stairs': {
                    shapes.push(...StyleStairs.calculate(b, pos, neighbours, world.chunkManager).getShapes(new Vector(pos).multiplyScalar(-1), f));
                    break;
                }
                case 'trapdoor': {
                    let cardinal_direction = b.getCardinalDirection();
                    let opened = this.isOpened(b);
                    let on_ceil = this.isOnCeil(b);
                    let sz = 3 / 15.9;
                    if(opened) {
                        shapes.push(aabb.set(0, 0, 0, 1, 1, sz).rotate(cardinal_direction, shapePivot).toArray());
                    } else {
                        if(on_ceil) {
                            shapes.push(aabb.set(0, 1-sz, 0, 1, 1, 1, sz).rotate(cardinal_direction, shapePivot).toArray());
                        } else {
                            shapes.push(aabb.set(0, 0, 0, 1, sz, 1, sz).rotate(cardinal_direction, shapePivot).toArray());
                        }
                    }
                    break;
                }
                case 'door': {
                    let cardinal_direction = CubeSym.dirAdd(b.getCardinalDirection(), CubeSym.ROT_Y2);
                    if(this.isOpened(b)) {
                        cardinal_direction = CubeSym.dirAdd(cardinal_direction, b.extra_data.left ? DIRECTION.RIGHT : DIRECTION.LEFT);
                    }
                    let sz = 3 / 15.9;
                    shapes.push(aabb.set(0, 0, 0, 1, 1, sz).rotate(cardinal_direction, shapePivot).toArray());
                    break;
                }
                default: {
                    const styleVariant = BLOCK.styles.get(material.style);
                    if (styleVariant && styleVariant.aabb) {
                        shapes.push(
                            ...styleVariant.aabb(b, for_physic).map(aabb => aabb.toArray())
                        );
                    } else {
                        debugger
                        console.error('Deprecated');
                    }
                    break;
                }
            }
        } else {
            if(!for_physic) {
                const styleVariant = BLOCK.styles.get(material.style);
                if (styleVariant && styleVariant.aabb) {
                    let aabbs = styleVariant.aabb(b);
                    if(!Array.isArray(aabbs)) {
                        aabbs = [aabbs];
                    }
                    shapes.push(
                        ...aabbs.map(aabb => aabb.toArray())
                    );
                } else {
                    switch(material.style) {
                        /*case 'sign': {
                            let hw = (4/16) / 2;
                            let sign_height = 1;
                            shapes.push([
                                .5-hw, 0, .5-hw,
                                .5+hw, sign_height, .5+hw
                            ]);
                            break;
                        }*/
                        case 'planting': {
                            let hw = (12/16) / 2;
                            let h = 12/16;
                            shapes.push([.5-hw, 0, .5-hw, .5+hw, h, .5+hw]);
                            break;
                        }
                        case 'ladder': {
                            let cardinal_direction = b.getCardinalDirection();
                            let width = 1/16;
                            shapes.push(aabb.set(0, 0, 0, 1, 1, width).rotate(cardinal_direction, shapePivot).toArray());
                            break;
                        }
                    }
                }                
            }
        }
        return shapes;
    }

};

// Init
BLOCK.init = async function(settings) {

    if(BLOCK.list.size > 0) {
        throw 'Already inited';
    }

    BLOCK.reset();

    // Resource packs
    BLOCK.resource_pack_manager = new ResourcePackManager();

    // block styles and resorce styles is independent (should)
    // block styles is how blocks is generated
    // resource styles is textures for it

    return Promise.all([
        Resources.loadBlockStyles(settings),
        BLOCK.resource_pack_manager.init(settings)
    ]).then(([block_styles, _])=>{
        // Block styles
        for(let style of block_styles.values()) {
            BLOCK.registerStyle(style);
        }    
    });
};