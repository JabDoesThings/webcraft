import { ServerClient } from "../../../www/js/server_client.js";

export default class packet_reader {

    // must be puto to queue
    static get queue() {
        return false;
    }

    // which command can be parsed with this class
    static get command() {
        return ServerClient.CMD_QUEST_GET_ENABLED;
    }

    // 
    static async read(player, packet) {
        player.quests.sendAll();
        return true;
    }

}