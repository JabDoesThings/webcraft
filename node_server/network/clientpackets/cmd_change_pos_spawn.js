import { ServerClient } from "../../../www/js/server_client.js";

// Change spawn position
export default class packet_reader {

    // must be puto to queue
    static get queue() {
        return false;
    }

    // which command can be parsed with this class
    static get command() {
        return ServerClient.CMD_CHANGE_POS_SPAWN;
    }

    // 
    static async read(player, packet) {
        player.changePosSpawn(packet.data);
        return true;
    }

}