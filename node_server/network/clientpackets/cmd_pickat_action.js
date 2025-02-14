import { ServerClient } from "../../../www/js/server_client.js";
import { doBlockAction } from "../../../www/js/block_action.js";
import { Vector } from "../../../www/js/helpers.js";

export default class packet_reader {

    // must be puto to queue
    static get queue() {
        return true;
    }

    // which command can be parsed with this class
    static get command() {
        return ServerClient.CMD_PICKAT_ACTION;
    }

    // Pickat action
    static async read(player, packet) {
        const world = player.world;
        const currentInventoryItem = player.inventory.current_item;
        if (packet.data.interractMob) {
            const mob = world.mobs.get(packet.data.interractMob);
            if (mob) {
                mob.punch(player, packet.data);
            }
        } else {
            const player_info = {
                radius:     0.7,
                height:     player.height,
                username:   player.session.username,
                pos:        new Vector(player.state.pos),
                rotate:     player.rotateDegree.clone(),
                session:    {
                    user_id: player.session.user_id
                }
            };
            const actions = await doBlockAction(packet.data, world, player_info, currentInventoryItem);
            // @todo Need to compare two actions
            // console.log(JSON.stringify(params.actions.blocks));
            // console.log(JSON.stringify(actions.blocks));
            await world.applyActions(player, actions);
        }
		if(packet.data.destroyBlock == true) {
			player.state.stats.pickat++;
		}
        return true;
    }

}