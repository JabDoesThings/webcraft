import { ToggleButton, Window } from "../../../tools/gui/wm.js";
import { QuestGroup } from "./group.js";

//
export class QuestMenu extends Window {

    //
    constructor(x, y, w, h, id, title, text) {
        super(x, y, w, h, id, title, text);
        // Ширина / высота слота
        this.cell_size = 36 * this.zoom;
        this.max_height = 0;
        this.wheel_scroll = 36 * this.zoom;
        //
        this.style.background.color = '#00000000';
        this.style.border.hidden = true;
        const FONT_ZOOM = this.zoom / 2;
        this.style.font.size = 20 * FONT_ZOOM;
        //
        this._wheel = function(e) {
            this.scrollY += Math.sign(e.original_event.wheelDeltaY) * this.wheel_scroll;
            this.scrollY = Math.min(this.scrollY, 0);
            this.scrollY = Math.max(this.scrollY, Math.max(this.max_height - this.height, 0) * -1);
        };
    }

    setViewer(quest_viewer) {
        this.quest_viewer = quest_viewer;
    }

    // Update menu
    update(groups) {
        // save active menu
        let active_quest = this.quest_viewer.quest;
        // remove previous menu items
        for(let id of this.list.keys()) {
            this.delete(id);
        }
        // create menu items
        this.init(groups);
        // refresh quest view
        if(active_quest) {
            for(let id of this.list.keys()) {
                if(id == `btnQuest${active_quest.id}`) {
                    this.list.get(id).toggle();
                }
            }
            for(let group of groups) {
                for(let quest of group.quests) {
                    if(quest.id == this.quest_viewer.quest.id) {
                        this.quest_viewer.show(quest);
                    }
                }
            }
        }
    }

    // Init
    init(groups) {
        const ct                = this;
        const GROUP_ROW_WIDTH   = this.width;
        const FONT_ZOOM         = this.zoom / 2;
        const GROUP_ROW_HEIGHT  = 50 * FONT_ZOOM;
        const GROUP_MARGIN      = 20 * FONT_ZOOM;
        const BUTTON_HEIGHT     = 55 * FONT_ZOOM; 
        let x = 0;
        let y = 0;
        // Each groups
        for(let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const lblGroup = new QuestGroup(x, y, GROUP_ROW_WIDTH, GROUP_ROW_HEIGHT, 'lblGroup' + group.id, group.title, null);
            //
            lblGroup.style.textAlign.vertical = 'bottom';
            lblGroup.style.padding.left = 0;
            lblGroup.style.padding.bottom = 0;
            lblGroup.onMouseDown = function(e) {
                return false;
            };
            ct.add(lblGroup);
            y += GROUP_ROW_HEIGHT + GROUP_MARGIN;
            // Each quests
            for(let quest of group.quests) {
                let title = quest.title;
                let status = quest.is_completed ? '✅' : (quest.in_progress ? '🕒' : '🆕');
                const tb = new ToggleButton(x, y, this.width, BUTTON_HEIGHT, 'btnQuest' + quest.id, `${status} ${title}`);
                tb.style.font.size = 26 * FONT_ZOOM;
                ct.add(tb);
                y += tb.height + GROUP_MARGIN;
                tb.onMouseDown = (e) => {
                    if(tb.toggled) {
                        return false;
                    }
                    this.quest_viewer.show(quest);
                    tb.toggle();
                }
            }
        }
        this.calcMaxHeight();
    }

}