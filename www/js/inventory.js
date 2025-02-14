import {CraftTable, InventoryWindow, ChestWindow, CreativeInventoryWindow, EditSignWindow, FurnaceWindow, ChargingStationWindow} from "./window/index.js";
import {Vector, Helpers} from "./helpers.js";
import {RecipeManager} from "./recipes.js";
import {BLOCK} from "./blocks.js";
import {Resources} from "./resources.js";
import { PlayerInventory } from "./player_inventory.js";

// Player inventory
export class Inventory extends PlayerInventory {

    constructor(player, hud) {
        super(null, {current: {index: 0, index2: -1}, items: []});
        this.player         = player;
        this.hud            = hud;
        for(let i = 0; i < this.max_count; i++) {
            this.items.push(null);
        }
        //
        this.select(this.current.index);
        // Recipe manager
        this.recipes = new RecipeManager(true);
    }

    setState(inventory_state) {
        this.current = inventory_state.current;
        this.items = inventory_state.items;
        for(const item of this.items) {
            if(item && 'id' in item) {
                item.name = BLOCK.fromId(item.id).name;
            }
        }
        this.refresh(false);
    }

    get inventory_window() {
        return Game.hud.wm.getWindow('frmInventory');
    }

    // Open window
    open() {
        if(this.player.game_mode.isCreative()) {
            Game.hud.wm.getWindow('frmCreativeInventory').toggleVisibility();
        } else {
            Game.hud.wm.getWindow('frmInventory').toggleVisibility();
        }
    }

    // Refresh
    refresh(changed) {
        if(this.hud) {
            this.hud.refresh();
            try {
                let frmRecipe = Game.hud.wm.getWindow('frmRecipe');
                frmRecipe.paginator.update();
            } catch(e) {
                // do nothing
            }
        }
        return true;
    }

    // drawHUD
    drawHUD(hud) {
        if(!this.inventory_image) {
            return this.initUI();
        }
        if(!this.current.index) {
            this.current.index = 0;
        }
        hud.wm.centerChild();
    }

    // drawHotbar
    drawHotbar(hud, cell_size, pos, zoom) {
        if(!this.inventory_image) {
            return this.initUI();
        }
        hud.ctx.imageSmoothingEnabled = false;
        // 1. that.inventory_image
        // 2. inventory_selector
        // img,sx,sy,swidth,sheight,x,y,width,height
        const hud_pos = new Vector(pos.x, pos.y, 0);
        const DEST_SIZE = 64 * zoom;
        // style
        hud.ctx.font            = Math.round(18 * zoom) + 'px ' + UI_FONT;
        hud.ctx.textAlign       = 'right';
        hud.ctx.textBaseline    = 'bottom';
        for(const k in this.items) {
            const item = this.items[k];
            if(k >= this.hotbar_count) {
                break;
            }
            if(item) {
                if(!('id' in item)) {
                    console.error(item);
                }
                let mat = BLOCK.fromId(item.id);
                const icon = BLOCK.getInventoryIconPos(
                    mat.inventory_icon_id,
                    this.inventory_image.width,
                    this.inventory_image.width / 16
                );
                hud.ctx.drawImage(
                    this.inventory_image,
                    icon.x,
                    icon.y,
                    icon.width,
                    icon.height,
                    hud_pos.x + cell_size / 2 - 49 * zoom / 2 - 4 * zoom,
                    hud_pos.y + cell_size / 2 - 48 * zoom / 2 - 2 * zoom,
                    DEST_SIZE,
                    DEST_SIZE
                    );
                // Draw instrument life
                const power_in_percent = mat?.item?.indicator == 'bar';
                if((mat.item?.instrument_id && item.power < mat.power) || power_in_percent) {
                    const power_normal = Math.min(item.power / mat.power, 1);
                    let cx = hud_pos.x + 14 * zoom;
                    let cy = hud_pos.y + 14 * zoom;
                    let cw = 40 * zoom;
                    let ch = 43 * zoom;
                    hud.ctx.fillStyle = '#000000ff';
                    hud.ctx.fillRect(cx, cy + ch - 8 * zoom, cw, 6 * zoom);
                    //
                    let rgb = Helpers.getColorForPercentage(power_normal);
                    hud.ctx.fillStyle = rgb.toCSS();
                    hud.ctx.fillRect(cx, cy + ch - 8 * zoom, cw * power_normal | 0, 4 * zoom);
                }
                // Draw label
                let label = item.count > 1 ? item.count : null;
                let shift_y = 0;
                if(this.current.index == k) {
                    if(!label && 'power' in item) {
                        if(power_in_percent) {
                            label = (Math.round((item.power / mat.power * 100) * 100) / 100) + '%';
                        } else {
                            label = Math.round(item.power * 100) / 100;
                        }
                        shift_y = -10;
                    }
                }
                if(label) {
                    hud.ctx.textBaseline = 'bottom';
                    hud.ctx.font = Math.round(18 * zoom) + 'px ' + UI_FONT;
                    hud.ctx.fillStyle = '#000000ff';
                    hud.ctx.fillText(label, hud_pos.x + cell_size - 5 * zoom, hud_pos.y + cell_size + shift_y * (zoom / 2));
                    hud.ctx.fillStyle = '#ffffffff';
                    hud.ctx.fillText(label, hud_pos.x + cell_size - 5 * zoom, hud_pos.y + cell_size + (shift_y - 2) * (zoom / 2));
                }
            }
            hud_pos.x += cell_size;
        }
    }

    // initUI...
    initUI() {
        this.inventory_image = Resources.inventory.image;
        this.hud.add(this, 0);
        // CraftTable
        this.ct = new CraftTable(this.recipes, 0, 0, 352, 332, 'frmCraft', null, null, this);
        this.ct.visible = false;
        this.hud.wm.add(this.ct);
        // Inventory window
        this.frmInventory = new InventoryWindow(this.recipes, 10, 10, 352, 332, 'frmInventory', null, null, this);
        this.hud.wm.add(this.frmInventory);
        // Creative Inventory window
        this.frmCreativeInventory = new CreativeInventoryWindow(10, 10, 390, 416, 'frmCreativeInventory', null, null, this);
        this.hud.wm.add(this.frmCreativeInventory);
        // Chest window
        this.frmChest = new ChestWindow(10, 10, 352, 332, 'frmChest', null, null, this);
        this.hud.wm.add(this.frmChest);
        // Furnace window
        this.frmFurnace = new FurnaceWindow(10, 10, 352, 332, 'frmFurnace', null, null, this);
        this.hud.wm.add(this.frmFurnace);
        // Charging station window
        this.frmChargingStation = new ChargingStationWindow(10, 10, 352, 332, 'frmChargingStation', null, null, this);
        this.hud.wm.add(this.frmChargingStation);
        // Edit sign
        this.frmEditSign = new EditSignWindow(10, 10, 236, 192, 'frmEditSign', null, null, this);
        this.hud.wm.add(this.frmEditSign);
    }

}