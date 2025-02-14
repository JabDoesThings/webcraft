import { ServerClient } from "../../../www/js/server_client.js";

export default class packet_reader {

    // must be puto to queue
    static get queue() {
        return false;
    }

    // which command can be parsed with this class
    static get command() {
        return ServerClient.CMD_PLAYER_STATE;
    }

    // 
    static async read(player, packet) {
        const data = packet.data;
        player.world.changePlayerPosition(player, data);
        //
        const distance = Math.sqrt(Math.pow(data.pos.x, 2) + Math.pow(data.pos.y, 2) + Math.pow(data.pos.z, 2));
        if ((distance.toFixed(1) % 1) == 0) {
            player.state.stats.distance++;
        }
        return true;
    }

}