import { BLOCK } from "./blocks.js";
import {Vector} from "./helpers.js";

const MAX_NAME_SHOW_TIME = 2000;

const LIVE_SHIFT_RANDOM = new Array(1024);
for(let i = 0; i < LIVE_SHIFT_RANDOM.length; i++) {
    LIVE_SHIFT_RANDOM[i] = Math.round(Math.random());
}

export class Hotbar {

    zoom = UI_ZOOM;

    constructor(hud, inventory) {
        let that                = this;
        this.hud                = hud;
        this.image              = new Image(); // new Image(40, 40); // Размер изображения
        //
        this.image.onload = function() {
            that.hud.add(that, 0);
        }
        this.image.src = './media/hotbar.png';
        //
        this.itemTitleO = null;
        this.itemTitleChangeTime = performance.now();
        this.last_damage_time = null;
    }

    //
    setInventory(inventory) {
        this.inventory = inventory;
    }

    //
    damage(damage_value, reason_text) {
        Game.sounds.play('madcraft:block.player', 'hit');
        this.last_damage_time = performance.now();
        console.error('error_not_implemented', damage_value, reason_text);
        /*
        if(damage_value > 0) {
            Game.player.world.server.ModifyIndicator('live', -damage_value, reason_text);
            console.log('Damage ' + damage_value + ', reason: ' + reason_text);
            // Play hit sound
            Game.sounds.play('madcraft:block.player', 'hit');
        }
        */
    }

    setState(new_state) {
        for(const [key, value] of Object.entries(new_state)) {
            this[key] = value;
        }
    };
    
    drawHUD(hud) {

        const player = this.inventory.player;
        if(player.game_mode.isSpectator()) {
            return false;
        }

        // Source image sizes
        const sw                = 1092; // this.image.width;
        const sh                = 294; // this.image.height;
        const slive_bar_height  = 162;
        const selector          = {x: 162, y: 300, width: 144, height: 138};
        const src = {
            icons: {
                live: {x: 0, y: 300, width: 54, height: 54},
                live_half: {x: 0, y: 354, width: 54, height: 54},
                food: {x: 54, y: 300, width: 54, height: 54},
                food_half: {x: 54, y: 354, width: 54, height: 54}
            }
        };

        // Target sizes
        const dst = {
            w: 546 * this.zoom,
            h: 147 * this.zoom,
            live_bar_height: 81 * this.zoom,
            selector: {
                width: 72 * this.zoom,
                height: 69 * this.zoom
            }
        };
        const hud_pos = {
            x: (hud.width / 2 - dst.w / 2),
            y: hud.height - dst.h
        };

        // Other sizes
        const cell_size         = 60 * this.zoom;
        const ss                = 27 * this.zoom;
        const mayGetDamaged     = player.game_mode.mayGetDamaged();

        // Draw item name in hotbar
        let currentInventoryItem = player.currentInventoryItem;
        if(currentInventoryItem) {
            let itemTitle = BLOCK.getBlockTitle(currentInventoryItem);
            if(itemTitle != this.itemTitleO) {
                this.itemTitleO = itemTitle;
                this.itemTitleChangeTime = performance.now();
            }
            const time_remains = performance.now() - this.itemTitleChangeTime;
            if(time_remains < MAX_NAME_SHOW_TIME) {
                // Text opacity
                let alpha = 1;
                alpha = Math.min(2 - (time_remains / MAX_NAME_SHOW_TIME) * 2, 1);
                let aa = Math.ceil(255 * alpha).toString(16); if(aa.length == 1) {aa = '0' + aa;}
                //
                hud.ctx.textBaseline = 'bottom';
                hud.ctx.font = Math.round(24 * this.zoom) + 'px ' + UI_FONT;
                const yMargin = mayGetDamaged ? 40 * this.zoom : 0;
                // Measure text
                if(!this.prevItemMeasure || this.prevItemMeasure.text != itemTitle) {
                    this.prevItemMeasure = {
                        text: itemTitle,
                        measure: hud.ctx.measureText(itemTitle)
                    };
                }
                const textWidth = this.prevItemMeasure.measure.width;
                hud.ctx.fillStyle = '#000000' + aa;
                hud.ctx.fillText(itemTitle, hud.width / 2 - textWidth / 2, hud_pos.y + cell_size - yMargin);
                hud.ctx.fillStyle = '#ffffff' + aa;
                hud.ctx.fillText(itemTitle, hud.width / 2 - textWidth / 2, hud_pos.y + cell_size - yMargin - 2 * this.zoom);
                //
                hud.refresh();
            }
        } else {
            this.itemTitleO = null;
        }

        if(mayGetDamaged) {
            // bar
            hud.ctx.drawImage(
                this.image,
                0,           // sx
                0,           // sy
                sw,          // sw
                sh,          // sh
                hud_pos.x,   // dx
                hud_pos.y,   // dy
                dst.w,       // dw
                dst.h        // dh
            );
            // Indicators
            let indicators = player.indicators;
            let live = indicators.live.value / 20;
            let food = indicators.food.value / 20;
            //
            let spn = Math.round(performance.now() / 75);
            let calcShiftY = (i, live) => {
                let shift_y = 0;
                if(live < .35) {
                    shift_y = LIVE_SHIFT_RANDOM[(spn + i) % LIVE_SHIFT_RANDOM.length] * 5;
                }
                return shift_y;
            };
            // live
            // backgrounds
            const damage_time = 1000;
            if(Game.hotbar.last_damage_time && performance.now() - Game.hotbar.last_damage_time < damage_time) {
                let diff = performance.now() - Game.hotbar.last_damage_time;
                if(diff % 200 < 100) {
                    hud.ctx.filter = 'opacity(.5)';
                }
            }
            for(let i = 0; i < 10; i++) {
                let shift_y = calcShiftY(i, live);
                hud.ctx.drawImage(
                    this.image,
                    src.icons.live.x,
                    src.icons.live_half.y + src.icons.live_half.height,
                    src.icons.live.width,
                    src.icons.live.height,
                    hud_pos.x + i * 24 * this.zoom,
                    hud_pos.y + 30 * this.zoom + shift_y,
                    ss,
                    ss
                );
            }
            hud.ctx.filter = 'none';
            for(let i = 0; i < Math.floor(live * 10); i++) {
                let shift_y = calcShiftY(i, live);
                hud.ctx.drawImage(
                    this.image,
                    src.icons.live.x,
                    src.icons.live.y,
                    src.icons.live.width,
                    src.icons.live.height,
                    hud_pos.x + i * 24 * this.zoom,
                    hud_pos.y + 30 * this.zoom + shift_y,
                    ss,
                    ss
                );
            }
            if(Math.round(live * 10) > Math.floor(live * 10)) {
                let shift_y = calcShiftY(Math.floor(live * 10), live);
                hud.ctx.drawImage(
                    this.image,
                    src.icons.live_half.x,
                    src.icons.live_half.y,
                    src.icons.live_half.width,
                    src.icons.live_half.height,
                    hud_pos.x + Math.floor(live * 10) * (24 * this.zoom),
                    hud_pos.y + (30 * this.zoom) + shift_y,
                    ss,
                    ss
                );
            }
            // foods
            food = 0.55;
            for(let i = 0; i < Math.floor(food * 10); i++) {
                hud.ctx.drawImage(
                    this.image,
                    src.icons.food.x,
                    src.icons.food.y,
                    src.icons.food.width,
                    src.icons.food.height,
                    hud_pos.x + dst.w - (i * 24 * this.zoom + ss),
                    hud_pos.y + 30 * this.zoom,
                    ss,
                    ss
                );
            }
            if(Math.round(food * 10) > Math.floor(food * 10)) {
                hud.ctx.drawImage(
                    this.image,
                    src.icons.food_half.x,
                    src.icons.food_half.y,
                    src.icons.food_half.width,
                    src.icons.food_half.height,
                    hud_pos.x + dst.w - (Math.floor(food * 10) * 24 * this.zoom + ss),
                    hud_pos.y + 30 * this.zoom,
                    ss,
                    ss
                );
            }
        } else {
            // bar
            hud.ctx.drawImage(
                this.image,
                0,
                slive_bar_height,
                sw,
                sh - slive_bar_height,
                hud_pos.x,
                hud_pos.y + dst.live_bar_height,
                dst.w,
                dst.h - dst.live_bar_height
            );
        }
        // inventory_selector
        hud.ctx.drawImage(
            this.image,
            selector.x,
            selector.y,
            selector.width,
            selector.height,
            hud_pos.x - 3 * this.zoom + this.inventory.getRightIndex() * cell_size,
            hud_pos.y + (48 + 30) * this.zoom,
            dst.selector.width,
            dst.selector.height
        );
        if(this.inventory) {
            this.inventory.drawHotbar(hud, cell_size, new Vector(hud_pos.x, hud_pos.y + (48 + 30) * this.zoom, 0), this.zoom);
        }
    }

}