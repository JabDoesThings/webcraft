import {Helpers} from "./helpers.js";
import {PlayerModel} from "./player_model.js";
import {ServerClient} from "./server_client.js";

export class PlayerManager {
	
    constructor(world) {
        this.world = world;
        this.list = new Map();
    }

    init() {
        // On server message
        this.world.server.AddCmdListener([ServerClient.CMD_PLAYER_JOIN, ServerClient.CMD_PLAYER_LEAVE, ServerClient.CMD_PLAYER_STATE], (cmd) => {
            switch(cmd.name) {
                case ServerClient.CMD_PLAYER_JOIN: {
                    this.add(cmd);
                    break;
                }
                case ServerClient.CMD_PLAYER_LEAVE: {
                    this.delete(cmd.data.id);
                    break;
                }
                case ServerClient.CMD_PLAYER_STATE: {
                    this.setState(cmd);
                    break;
                }
            }
        });
    }

    // addPlayer
    add(cmd) {
        const data = cmd.data;
        const player = new PlayerModel({
            id:             data.id,
            pos:            data.pos,
            pitch:          data.rotate.x,
            yaw:            data.rotate.z,
            skin:           data.skin,
            username:       data.username,
            type:           data.type || 'player',
        });

        player.world = this.world;

        this.list.set(data.id, player);
        this.setState(cmd);
    }

    // getPlayer
    get(id) {
        if(!this.list.has(id)) {
            return null;
        }
        return this.list.get(id);
    }

    // deletePlayer
    delete(id) {
        this.list.delete(id);
    }

    // setPlayerState
    setState(cmd) {
        const {
            data, time, 
        } = cmd;

        let player = this.get(data.id);

        if(!player) { 
            return;
        }

        player.applyNetState({
            pos: data.pos,
            sneak: !!data.sneak,
            rotate: data.rotate,
            time: time,
            hands: data.hands
        });
    
    }

    //
    drawGhost(player) {
        this.list.set('itsme', new PlayerModel({
            id:             'itsme',
            itsme:          false,
            rotate:         player.rotate.clone(),
            pos:            player.pos.clone(),
            pitch:          player.rotate.x,
            yaw:            player.rotate.z,
            skin:           Game.skin.id,
            sneak:          player.isSneak,
            username:       Game.App.session.username + ' Ghost',
            hands:          {left: {id: null}, right: {id: player.currentInventoryItem?.id}}
        }));
    };

}