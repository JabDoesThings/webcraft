import {BLOCK} from "./blocks.js";
import {Helpers, Vector} from "./helpers.js";
import {ServerClient} from "./server_client.js";
import {InventoryComparator} from "./inventory_comparator.js";

export class PlayerInventory {

    temp_vec = new Vector();

    constructor(player, state) {
        this.count          = state.items.length;
        this.player         = player;
        this.current        = state.current;
        this.items          = new Array(this.count); // state.items;
        this.max_count      = 36;
        this.hotbar_count   = 9;
        this.drag_item      = null;
        this.onSelect       = (item) => {};
        this.applyNewItems(state.items, false);
    }

    // Refresh
    refresh(send_state) {
        const data = {
            current: this.current,
            items: this.items
        };
        this.current.index = isNaN(data.current.index) ? 0 : data.current.index;
        this.current.index2 = isNaN(data.current.index2) ? -1 : data.current.index2;
        this.player.updateHands();
        this.player.world.db.savePlayerInventory(this.player, data);
        let packets = [{
            name: ServerClient.CMD_PLAYER_STATE,
            data: this.player.exportState()
        }];
        this.player.world.sendAll(packets, [this.player.session.user_id]);
        // Send new inventory to player
        if(send_state) {
            this.player.world.sendSelected([{name: ServerClient.CMD_INVENTORY_STATE, data: data}], [this.player.session.user_id], []);
        }
        return true;
    }

    //
    setIndexes(data, send_state) {
        this.current.index = Helpers.clamp(data.index, 0, this.hotbar_count - 1);
        this.current.index2 = Helpers.clamp(data.index2, -1, this.max_count - 1);
        this.refresh(send_state);
    }

    // Игрок прислал новое состояние инвентаря, нужно его провалидировать и применить
    async newState(params) {
        if(!('state' in params && 'used_recipes' in params)) {
            throw 'error_invalid_inventory_state_params';
        }
        // New state
        const state = params.state;
        if('items' in state) {
            let equal = this.player.game_mode.isCreative();
            const old_items = this.items;
            const new_items = state.items;
            if(!equal) {
                equal = await InventoryComparator.checkEqual(old_items, new_items, params.used_recipes);
            }
            if(equal) {
                // apply new
                this.applyNewItems(new_items, true);
                // send current to player
                this.refresh(true);
                console.log('Applied new state');
                //
                if(this.player.onCrafted) {
                    const rm = await InventoryComparator.getRecipeManager();
                    for(let recipe_id of params.used_recipes) {
                        const recipe = rm.getRecipe(recipe_id);
                        this.player.onCrafted(recipe, {block_id: recipe.result.item_id, count: recipe.result.count});
                    }
                }
            } else {
                // send current to player
                this.refresh(true);
                console.log('Ignore new state');
            }
        }
    }

    //
    applyNewItems(items, refresh) {
        if(!Array.isArray(items)) {
            throw 'error_items_must_be_array';
        }
        if(items.length != this.count) {
            throw 'error_items_invalid_count|' + `${items.length} != ${this.count}`;
        }
        let new_items = [];
        for(let i in items) {
            let b = null;
            if(items[i]) {
                b = BLOCK.fromId(items[i].id)
            }
            new_items[i] = BLOCK.convertItemToInventoryItem(items[i], b);
        }
        this.items = new_items;
        if(refresh) {
            this.refresh(true);
        }
    }

    // Return current active item in hotbar
    get current_item() {
        return this.items[this.current.index];
    }

    //
    select(index) {
        if(index < 0) {
            index = this.hotbar_count - 1;
        }
        if(index >= this.hotbar_count) {
            index = 0;
        }
        this.current.index = index;
        this.refresh(true);
        this.onSelect(this.current_item);
    }

    // Increment
    increment(mat, no_update_if_remains) {
        if(!mat.id) {
            throw 'error_empty_block_id';
        }
        mat.id = parseInt(mat.id);
        mat.count = parseInt(mat.count);
        if(mat.count == 0) {
            throw 'error_increment_value_less_then_one';
        }
        let block = BLOCK.BLOCK_BY_ID.get(mat.id);
        if(!block) {
            throw 'error_invalid_block_id';
        }
        no_update_if_remains = !!no_update_if_remains;
        // fill material default properties
        mat = Object.assign({
            name:               block.name,
            tags:               block.tags,
            inventory_icon_id:  block.inventory_icon_id,
            max_in_stack:       block.max_in_stack,
        }, JSON.parse(JSON.stringify(mat)));
        const item_max_count = block.max_in_stack;
        let need_refresh = false;
        //
        const updated = new Map();
        const added = new Map();
        //
        // 1. update cell if exists
        for(let i in this.items) {
            const item = this.items[i];
            if(item) {
                if(item.id == mat.id) {
                    if(item.count < item_max_count) {
                        if(item.count + mat.count <= item_max_count) {
                            updated.set(i, Math.min(item.count + mat.count, item_max_count));
                            mat.count = 0;
                            need_refresh = true;
                            break;
                        } else {
                            mat.count = (item.count + mat.count) - item_max_count;
                            updated.set(i, item_max_count);
                            need_refresh = true;
                        }
                    }
                }
            }
        }
        // 2. start new slot
        if(mat.count > 0) {
            for(let i = 0; i < this.max_count; i++) {
                if(!this.items[i]) {
                    const new_clot = {...mat};
                    added.set(i, new_clot);
                    need_refresh = true;
                    if(new_clot.count > item_max_count) {
                        mat.count -= item_max_count;
                        new_clot.count = item_max_count;
                    } else {
                        mat.count = 0;
                        break;
                    }
                }
            }
        }
        // @debug info
        // console.log('---------------')
        // console.log(mat.count, no_update_if_remains, need_refresh)
        // console.log(Array.from(updated.entries()))
        // console.log(Array.from(added.entries()))
        // no update if remains
        if(no_update_if_remains && mat.count > 0) {
            return false;
        }
        if(need_refresh) {
            // updated
            for(let [i, count] of updated.entries()) {
                i = parseInt(i);
                this.items[i | 0].count = count;
            }
            // added
            let select_index = -1;
            for(let [i, item] of added.entries()) {
                i = parseInt(i);
                if('texture' in item) {
                    delete(item.texture);
                }
                this.items[i] = item;
                if(i == this.current.index) {
                    select_index = i;
                }
            }
            if(select_index >= 0) {
                this.select(select_index);
                return true;
            }
            return this.refresh(true);
        }
        return false;
    }

    decrement_instrument(mined_block) {
        if(!this.current_item || this.player.game_mode.isCreative()) {
            return;
        }
        const current_item_material = BLOCK.fromId(this.current_item.id);
        if(current_item_material.item?.instrument_id) {
            this.current_item.power = Math.max(this.current_item.power - 1, 0);
            if(this.current_item.power <= 0) {
                this.items[this.current.index] = null;
            }
            this.refresh(true);
        }
    }
    
    // Decrement
    decrement(decrement_item, ignore_creative_game_mode) {
        if(!this.current_item) {
            return;
        }
        if(!ignore_creative_game_mode && this.player.game_mode.isCreative()) {
            return;
        }
        const current_item_material = BLOCK.fromId(this.current_item.id);
        if(current_item_material.item?.instrument_id) {
            this.decrement_instrument();
        } else {
            this.current_item.count = Math.max(this.current_item.count - 1, 0);
            if(this.current_item.count < 1) {
                let matBlock = BLOCK.fromId(this.current_item.id);
                if(matBlock.item && matBlock.item?.name == 'bucket') {
                    if(matBlock.item.emit_on_set) {
                        const emptyBucket = BLOCK.BUCKET_EMPTY;
                        this.items[this.current.index] = {id: emptyBucket.id, count: 1};
                    }
                } else {
                    this.items[this.current.index] = null;
                }
            }
        }
        this.refresh(true);
    }

    // decrementByItemID
    decrementByItemID(item_id, count, dont_refresh) {
        for(let i in this.items) {
            let item = this.items[i];
            if(!item || item.count < 1) {
                continue;
            }
            if(item.id == item_id) {
                if(item.count >= count) {
                    item.count -= count;
                    if(item.count < 1) {
                        this.items[i] = null;
                    }
                    break;
                } else {
                    count -= item.count;
                    item.count = 0;
                    this.items[i] = null;
                }
            }
        }
        if(typeof dont_refresh === 'undefined' || !dont_refresh) {
            this.refresh(true);
        }
    }

    // Клонирование материала в инвентарь
    cloneMaterial(mat, allow_create_new) {
        if(mat.id < 2 || mat.deprecated) {
            return false;
        }
        while(mat.previous_part && mat.previous_part.id != mat.id) {
            let b = BLOCK.fromId(mat.previous_part.id);
            mat = {id: b.id, previous_part: b.previous_part};
        }
        mat = BLOCK.convertItemToInventoryItem(mat);
        // Search same material with count < max
        for(let k in Object.keys(this.items)) {
            k = parseInt(k);
            if(this.items[k]) {
                let item = this.items[k];
                if(item.id == mat.id) {
                    if(k >= this.hotbar_count) {
                        // swith with another from inventory
                        this.items[k] = this.items[this.current.index];
                        this.items[this.current.index] = item;
                        this.select(this.current.index);
                        return this.refresh(false);
                    } else {
                        // select if on hotbar
                        this.select(k);
                        return this.refresh(false);
                    }
                }
            }
        }
        if(!allow_create_new) {
            return false;
        }
        // Create in current cell if this empty
        if(this.current.index < this.hotbar_count) {
            let k = this.current.index;
            if(!this.items[k]) {
                this.items[k] = Object.assign({count: 1}, mat);
                delete(this.items[k].texture);
                this.select(parseInt(k));
                return this.refresh(true);
            }
        }
        // Start new cell
        for(let k in Object.keys(this.items)) {
            if(parseInt(k) >= this.hotbar_count) {
                break;
            }
            if(!this.items[k]) {
                this.items[k] = Object.assign({count: 1}, mat);
                delete(this.items[k].texture);
                this.select(parseInt(k));
                return this.refresh(true);
            }
        }
        // Replace current cell
        if(this.current.index < this.hotbar_count) {
            let k = this.current.index;
            this.items[k] = Object.assign({count: 1}, mat);
            delete(this.items[k].texture);
            this.select(parseInt(k));
            return this.refresh(true);
        }
    }

    // Drop item from hand
    dropItem(data) {
        if(!this.current_item) {
            return false;
        }
        const item = {...this.current_item};
        item.count = 1;
        const pos = this.player.state.pos.clone();
        pos.addSelf(this.temp_vec.set(
            -Math.sin(this.player.state.rotate.z) * .15 + Math.random() * .5,
            this.player.height * .4,
            -Math.cos(this.player.state.rotate.z) * .15 + Math.random() * .5,
        ));
        // Add velocity for drop item
        this.temp_vec.set(
            Math.sin(this.player.state.rotate.z) *  .5,
            .5,
            Math.cos(this.player.state.rotate.z) * .5,
        );
        this.player.world.createDropItems(this.player, pos, [item], this.temp_vec);
        if(this.current_item.count == 1) {
            this.setItem(this.current.index, null);
        } else {
            this.decrement(null, true);
        }
        return true;
    }

    // Has item
    hasItem(item) {
        if(!item || !('id' in item) || !('count' in item)) {
            return false;
        }
        //
        const item_col = InventoryComparator.groupToSimpleItems([item]);
        if(item_col.size != 1) {
            return false;
        }
        const item_key = item_col.keys().next()?.value;
        item = item_col.get(item_key);
        //
        const items = InventoryComparator.groupToSimpleItems(this.items);
        const existing_item = items.get(item_key);
        return existing_item && existing_item.count >= item.count;
    }

    // Decrement item
    decrementItem(item) {
        if(!item || !('id' in item) || !('count' in item)) {
            return false;
        }
        //
        const item_col = InventoryComparator.groupToSimpleItems([item]);
        if(item_col.size != 1) {
            return false;
        }
        const item_key = item_col.keys().next()?.value;
        item = item_col.get(item_key);
        //
        const items = InventoryComparator.groupToSimpleItems(this.items);
        const existing_item = items.get(item_key);
        if(!existing_item || existing_item.count < item.count) {
            return false;
        }
        // Decrement
        if(isNaN(item_key)) {
            // @todo Нужно по другому сделать вычитание, иначе если игрок не запросит свою постройку айтемов, на сервере у него порядок и группировка останется неправильной
            // Я сделал так, потому что математически у него останется правильное количество айтемов и меня это пока устраивает =)
            existing_item.count -= item.count;
            if(existing_item.count < 1) {
                items.delete(item_key);
            }
            this.items = Array.from(items.values());    
        } else {
            this.decrementByItemID(item.id, item.count, true);
        }
        return true;
    }

    // Возвращает список того, чего и в каком количестве не хватает в текущем инвентаре по указанному списку
    hasResources(resources) {
        let resp = [];
        for(let resource of resources) {
            let r = {
                item_id: resource.item_id,
                count: resource.count
            };
            // Each all items in inventoryy
            for(var item of this.items) {
                if(!item) {
                    continue;
                }
                if(item.id == r.item_id) {
                    if(item.count > r.count) {
                        r.count = 0;
                    } else {
                        r.count -= item.count;
                    }
                    if(r.count == 0) {
                        break;
                    }
                }
            }
            if(r.count > 0) {
                resp.push(r);
            }
        }
        return resp;
    }

    // Return items from inventory
    exportItems() {
        let resp = {
            current: {
                index: this.current.index,
                index2: this.current.index2
            },
            items: []
        }
        for(var item of this.items) {
            let t = null;
            if(item) {
                t = {
                    id:         item.id,
                    count:      item.count,
                    power:      item.power
                };
                // Individual properties
                for(let prop of ['entity_id', 'entity_name', 'extra_data']) {
                    t[prop] = null;
                    if(item.hasOwnProperty(prop)) {
                        t[prop] = item[prop];
                    }
                }
            }
            resp.items.push(t);
        }
        return resp;
    }

    getLeftIndex() {
        return this.current.index2;
    }

    getRightIndex() {
        return this.current.index;
    }
    
    //
    setItem(index, item) {
        this.items[index] = item;
        // Обновить текущий инструмент у игрока
        this.select(this.current.index);
    }

    next() {
        this.select(++this.current.index);
    }
    
    prev() {
        this.select(--this.current.index);
    }

}