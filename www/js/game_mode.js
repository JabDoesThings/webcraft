export const GAME_MODE = {};
    GAME_MODE.CREATIVE = 'creative';
    GAME_MODE.SURVIVAL = 'survival';
    GAME_MODE.ADVENTURE = 'adventure';
    GAME_MODE.SPECTATOR = 'spectator';

export class GameMode {

    constructor(player, game_mode_id) {
        this.player = player;
        this.onSelect = (mode) => {};
        this.modes = [];
        this.add({id: GAME_MODE.SURVIVAL, title: 'Survival', can_fly: false, block_action: true, block_clone: false, pickat_distance: 5, can_take_damage: true});
        this.add({id: GAME_MODE.CREATIVE, title: 'Creative', can_fly: true, block_action: true, block_clone: true, pickat_distance: 10, can_take_damage: false});
        this.add({id: GAME_MODE.ADVENTURE, title: 'Adventure', can_fly: false, block_action: false, block_clone: false, pickat_distance: 5, can_take_damage: true});
        this.add({id: GAME_MODE.SPECTATOR, title: 'Spectator', can_fly: true, block_action: false, block_clone: false, pickat_distance: 5, can_take_damage: false});
        if(game_mode_id) {
            this.applyMode(game_mode_id, false);
        }
    }

    // Добавление режима игры
    add(mode) {
        if(!this.current) {
            this.current = mode;
        }
        this.modes.push(mode);
    }

    // Return active game mode
    getCurrent() {
        return this.current;
    }

    // Игрок может получить урон
    mayGetDamaged() {
        return [GAME_MODE.SURVIVAL, GAME_MODE.ADVENTURE].indexOf(this.getCurrent().id) >= 0;
    }

    // Выживание
    isSurvival() {
        return this.getCurrent().id == GAME_MODE.SURVIVAL;
    }

    // Наблюдатель
    isSpectator() {
        return this.getCurrent().id == GAME_MODE.SPECTATOR;
    }

    // Творчество
    isCreative() {
        return this.getCurrent().id == GAME_MODE.CREATIVE;
    }

    // Позволяет ли текущий режим полёты
    canFly() {
        return this.getCurrent().can_fly;
    }

    // Позволяет ли текущий режим совершать действия с блоками
    canBlockAction() {
        return this.getCurrent().block_action;
    }

    // Позволяет ли текущий режим клонировать блоки
    canBlockClone() {
        return this.getCurrent().block_clone;
    }

    // Запрос смена режима игры на сервер
    setMode(id) {
        return this.player.world.server.GameModeSet(id);
    }

    // Применение указанного режима игры
    applyMode(id, notify) {
        for(let mode of this.modes) {
            if(mode.id == id) {
                this.current = mode;
                if(notify) {
                    this.onSelect(mode);
                }
                return true;
            }
        }
        return false;
    }

    // Переключить на следующий игровой режим
    next() {
        let index = 0;
        for(let mode of this.modes) {
            index++;
            if(mode.id == this.getCurrent().id) {
                break;
            }
        }
        let id = this.modes[index % this.modes.length].id;
        this.applyMode(id, true);
    }

    // getPickatDistance...
    getPickatDistance() {
        return this.getCurrent().pickat_distance;
    }

}