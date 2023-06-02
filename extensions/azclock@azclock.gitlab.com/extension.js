const {
    Clutter, Gio, GLib, GObject,
    Graphene, Meta, Pango, St,
} = imports.gi;

const DND = imports.ui.dnd;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const Me = ExtensionUtils.getCurrentExtension();
const PopupMenu = imports.ui.popupMenu;
const Utils = Me.imports.utils;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

let widgets, widgetData, extensionConnections, _updateClockId, _dataChangedTimeoutId;

const DEBUG_CLOCK_MODE = false;
const DEBUG_LOG = false;
let debugSeconds = 0;
let debugMinutes = 0;
let debugHours = 12;

const ANALOG_CLOCK = 'Analog_Clock';
const DIGITAL_CLOCK = 'Digital_Clock';
const TEXT_LABEL = 'Text_Label';
const WIDGET_DATA_INDEX = 0;

/**
 * @param {string} msg message to log
 */
function debugLog(msg) {
    if (DEBUG_LOG)
        log(msg);
}

var Clock = GObject.registerClass(
class AzClockClock extends St.BoxLayout {
    _init(index) {
        super._init({
            vertical: Utils.getData(widgetData, index, WIDGET_DATA_INDEX, 'Box_VerticalLayout', 'bool'),
            reactive: true,
            track_hover: true,
            can_focus: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
        });

        this.widgetIndex = index;
        this._menuManager = new PopupMenu.PopupMenuManager(this);

        this.connect('notify::hover', () => this._onHover());
        this.connect('destroy', () => this._onDestroy());

        if (!Utils.getData(widgetData, index, WIDGET_DATA_INDEX, 'Lock_Widget', 'bool'))
            this.makeDraggable();

        this.createClockElements();
        this.updateClock(true);
    }

    updateClockComponents(delay = 300) {
        debugLog('update clock components');
        let priority = GLib.PRIORITY_DEFAULT_IDLE;
        if (delay !== 300)
            priority = GLib.PRIORITY_DEFAULT;

        this._updateClockId = GLib.timeout_add(priority, delay, () => {
            this.setStyle();
            this.setClockStyle();
            this.queue_relayout();
            this.setPositionFromSettings();
            this.queue_relayout();
            this.updateClock(true);
            this._updateClockId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    createClockElements() {
        this.destroy_all_children();

        const clockData = widgetData[this.widgetIndex];

        this._clockLabels = [];
        this._clockFaces = [];
        this._clockSecondHands = [];
        this._clockMinuteHands = [];
        this._clockHourHands = [];
        this._clockButtons = [];

        // skip first element as that stores widget data, not clock elements
        for (let i = 1; i < clockData.length; i++) {
            const clockType = this.getClockElementData(i, 'Element_Type');
            if (clockType === DIGITAL_CLOCK) {
                const label = new St.Label({
                    y_align: Clutter.ActorAlign.CENTER,
                    pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
                });
                label.clutter_text.set({
                    ellipsize: Pango.EllipsizeMode.NONE,
                });
                label.elementIndex = i;
                this.add_child(label);
                this._clockLabels.push(label);
            } else if (clockType === ANALOG_CLOCK) {
                this._createAnalogClock(clockData[i], i);
            } else if (clockType === TEXT_LABEL) {
                const label = new St.Label({
                    y_align: Clutter.ActorAlign.CENTER,
                    pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
                });
                label.clutter_text.set({
                    ellipsize: Pango.EllipsizeMode.NONE,
                });
                label.elementIndex = i;
                label._isTextOnly = true;
                this.add_child(label);
                this._clockLabels.push(label);
            }
        }
        this.queue_relayout();
    }

    _getMetaRectForCoords(x, y) {
        this.get_allocation_box();
        const rect = new Meta.Rectangle();

        [rect.x, rect.y] = [x, y];
        [rect.width, rect.height] = this.get_transformed_size();
        return rect;
    }

    _getWorkAreaForRect(rect) {
        const monitorIndex = global.display.get_monitor_index_for_rect(rect);

        if (monitorIndex >= global.display.get_n_monitors()) {
            debugLog('monitorIndex outside of range of n monitors');
            return false;
        }

        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);

        // add a bit of padding
        const padding = 50;
        workArea.x -= padding;
        workArea.y -= padding;
        workArea.width += 2 * padding;
        workArea.height += 2 * padding;

        return workArea;
    }

    _isOnScreen(x, y) {
        const rect = this._getMetaRectForCoords(x, y);
        const monitorWorkArea = this._getWorkAreaForRect(rect);

        if (!monitorWorkArea)
            return true;

        return monitorWorkArea.contains_rect(rect);
    }

    _keepOnScreen(x, y) {
        const rect = this._getMetaRectForCoords(x, y);
        const monitorWorkArea = this._getWorkAreaForRect(rect);

        if (!monitorWorkArea)
            return [x, y];

        const monitorRight = monitorWorkArea.x + monitorWorkArea.width;
        const monitorBottom = monitorWorkArea.y + monitorWorkArea.height;

        x = Math.min(Math.max(monitorWorkArea.x, x), monitorRight - rect.width);
        y = Math.min(Math.max(monitorWorkArea.y, y), monitorBottom - rect.height);

        return [x, y];
    }

    setPositionFromSettings() {
        let x = this.getClockElementData(WIDGET_DATA_INDEX, 'Location_X', 'int');
        let y = this.getClockElementData(WIDGET_DATA_INDEX, 'Location_Y', 'int');
        debugLog(`set pos from settings - (${x}, ${y})`);
        this.set_position(x, y);

        if (!this.get_parent())
            return;

        if (!this._isOnScreen(x, y)) {
            [x, y] = this._keepOnScreen(x, y);

            this.ease({
                x,
                y,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });

            Me.settings.set_value('changed-data', new GLib.Variant('a{ss}', {
                'WidgetIndex': this.widgetIndex.toString(),
                'WidgetMoved': 'true',
            }));
            this.setClockElementData(WIDGET_DATA_INDEX, 'Location_X', x);
            this.setClockElementData(WIDGET_DATA_INDEX, 'Location_Y', y);
            debugLog(`pos from settings not on screen - (${x}, ${y})`);
        }
    }

    setStyle() {
        this.vertical = this.getClockElementData(WIDGET_DATA_INDEX, 'Box_VerticalLayout', 'bool');

        const borderEnabled = this.getClockElementData(WIDGET_DATA_INDEX, 'Box_BorderEnabled', 'bool');
        const borderWidth = this.getClockElementData(WIDGET_DATA_INDEX, 'Box_BorderWidth', 'int');
        const borderRadius = this.getClockElementData(WIDGET_DATA_INDEX, 'Box_BorderRadius', 'int');
        const borderColor = this.getClockElementData(WIDGET_DATA_INDEX, 'Box_BorderColor');
        const backgroundEnabled = this.getClockElementData(WIDGET_DATA_INDEX, 'Box_BackgroundEnabled', 'bool');
        const backgroundColor = this.getClockElementData(WIDGET_DATA_INDEX, 'Box_BackgroundColor');
        const boxSpacing = this.getClockElementData(WIDGET_DATA_INDEX, 'Box_Spacing', 'int');
        const boxPadding = this.getClockElementData(WIDGET_DATA_INDEX, 'Box_Padding', 'int');

        let style = `padding: ${boxPadding}px;
                     spacing: ${boxSpacing}px;`;

        if (backgroundEnabled) {
            style += `background-color: ${backgroundColor};
                      border-radius: ${borderRadius}px;`;
        }

        if (borderEnabled) {
            style += `border-width: ${borderWidth}px;
                      border-color: ${borderColor};`;
        }

        this.style = style;

        this.z_position = widgetData.length - this.widgetIndex;
    }

    setAnalogClockElementStyle(elementArray, elementName) {
        if (elementArray.length === 0)
            return;

        const clockData = widgetData[this.widgetIndex];
        const directoryName = elementName.toLowerCase();
        const filePath = `${Me.path}/media/${directoryName}/${directoryName}`;

        for (const hand of elementArray) {
            const data = clockData[hand.elementIndex];
            const styleType = data[`${elementName}_Style`] || 1;

            hand.style = this.getAnalogClockStyle(data, elementName);

            if (elementName === 'ClockFace' || elementName === 'SecondHand' || elementName === 'ClockButton')
                hand.visible = this.getClockElementData(hand.elementIndex, `${elementName}_Visible`, 'bool');

            hand.gicon = Gio.icon_new_for_string(`${filePath}-${styleType}-symbolic.svg`);
            hand.icon_size = parseInt(data['Clock_Size']);
        }
    }

    setClockStyle() {
        this.setAnalogClockElementStyle(this._clockFaces, 'ClockFace');
        this.setAnalogClockElementStyle(this._clockSecondHands, 'SecondHand');
        this.setAnalogClockElementStyle(this._clockMinuteHands, 'MinuteHand');
        this.setAnalogClockElementStyle(this._clockHourHands, 'HourHand');
        this.setAnalogClockElementStyle(this._clockButtons, 'ClockButton');

        for (const label of this._clockLabels) {
            const index = label.elementIndex;

            const shadowEnabled = this.getClockElementData(index, 'Text_ShadowEnabled', 'bool');
            const shadowX = this.getClockElementData(index, 'Text_ShadowX');
            const shadowY = this.getClockElementData(index, 'Text_ShadowY');
            const shadowSpread = this.getClockElementData(index, 'Text_ShadowSpread');
            const shadowBlur = this.getClockElementData(index, 'Text_ShadowBlur');
            const shadowColor = this.getClockElementData(index, 'Text_ShadowColor');

            const customFontEnabled = this.getClockElementData(index, 'Text_CustomFontEnabled', 'bool');
            const customFontFamily = this.getClockElementData(index, 'Text_CustomFontFamily');

            const textColor = this.getClockElementData(index, 'Text_Color');
            const textSize = this.getClockElementData(index, 'Text_Size');

            const textAlignmentX = this.getClockElementData(index, 'Text_AlignmentX', 'clutter_align');
            const textAlignmentY = this.getClockElementData(index, 'Text_AlignmentY', 'clutter_align');
            const textLineAlignment = this.getClockElementData(index, 'Text_LineAlignment', 'align');

            const marginTop = this.getClockElementData(index, 'Element_Margin_Top', 'int');
            const marginLeft = this.getClockElementData(index, 'Element_Margin_Left', 'int');
            const marginBottom = this.getClockElementData(index, 'Element_Margin_Bottom', 'int');
            const marginRight = this.getClockElementData(index, 'Element_Margin_Right', 'int');

            const paddingTop = this.getClockElementData(index, 'Element_Padding_Top', 'int');
            const paddingLeft = this.getClockElementData(index, 'Element_Padding_Left', 'int');
            const paddingBottom = this.getClockElementData(index, 'Element_Padding_Bottom', 'int');
            const paddingRight = this.getClockElementData(index, 'Element_Padding_Right', 'int');

            const borderEnabled = this.getClockElementData(index, 'Text_BorderEnabled', 'bool');
            const borderWidth = this.getClockElementData(index, 'Text_BorderWidth', 'int');
            const borderRadius = this.getClockElementData(index, 'Text_BorderRadius', 'int');
            const borderColor = this.getClockElementData(index, 'Text_BorderColor');
            const backgroundEnabled = this.getClockElementData(index, 'Text_BackgroundEnabled', 'bool');
            const backgroundColor = this.getClockElementData(index, 'Text_BackgroundColor');

            const margin = `margin: ${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`;
            const padding = `padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`;

            const dateFormat = this.getClockElementData(index, 'Text_DateFormat');

            let textStyle = `color: ${textColor}; ${margin}; ${padding};`;

            if (backgroundEnabled) {
                textStyle += `background-color: ${backgroundColor};
                              border-radius: ${borderRadius}px;`;
            }

            if (borderEnabled) {
                textStyle += `border-width: ${borderWidth}px;
                              border-color: ${borderColor};`;
            }

            if (shadowEnabled)
                textStyle += `text-shadow: ${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor};`;

            if (customFontEnabled) {
                const fontDesc = Pango.font_description_from_string(customFontFamily);
                textStyle += `font-family: "${fontDesc.get_family()}";`;
            }

            if (textLineAlignment)
                textStyle += `text-align: ${textLineAlignment}`;


            label.style = `font-size: ${textSize}pt; font-feature-settings: "tnum";${textStyle}`;

            label._dateFormat = dateFormat;

            label.x_align = textAlignmentX;
            label.y_align = textAlignmentY;

            if (label._isTextOnly) {
                const text = this.getClockElementData(index, 'Text_Text');
                label.text = text;
                label.clutter_text.set_markup(label.text);
            }
        }
    }

    getClockElementData(elementIndex, elementName, parseType) {
        return Utils.getData(widgetData, this.widgetIndex, elementIndex, elementName, parseType);
    }

    setClockElementData(elementIndex, elementName, newValue) {
        Utils.setData(widgetData, this.widgetIndex, elementIndex, elementName, newValue);
    }

    getElementDate(elementIndex, origDate) {
        const overrideTimeZoneEnabled = this.getClockElementData(elementIndex, 'TimeZoneOverrideEnabled', 'bool');
        const overrideTimeZone = this.getClockElementData(elementIndex, 'TimeZoneOverride') || 'UTC';

        if (overrideTimeZoneEnabled) {
            const gTimeZone = GLib.TimeZone.new(overrideTimeZone);
            const localDateTime = GLib.DateTime.new_now(gTimeZone);

            const year = localDateTime.get_year();
            const monthIndex = localDateTime.get_month() - 1;
            const day = localDateTime.get_day_of_month();
            const hours = localDateTime.get_hour();
            const minutes = localDateTime.get_minute();
            const seconds = localDateTime.get_second();

            const newDate = new Date(year, monthIndex, day, hours, minutes, seconds);

            return newDate;
        } else {
            return origDate;
        }
    }

    updateClock(immediate = false) {
        let date;
        if (DEBUG_CLOCK_MODE)
            date = new Date(`December 12, 2022 ${debugHours}:${debugMinutes}:${debugSeconds}`);
        else
            date = new Date();

        for (const label of this._clockLabels) {
            if (label._isTextOnly)
                continue;

            const index = label.elementIndex;
            const dateFormat = label._dateFormat;
            const elementDate = this.getElementDate(index, date);

            if (dateFormat) {
                label.text = elementDate.toLocaleFormat(dateFormat);
                label.clutter_text.set_markup(label.text);
            }
        }

        for (let i = 0; i < this._clockHourHands.length; i++) {
            const index = this._clockHourHands[i].elementIndex;
            const elementDate = this.getElementDate(index, date);

            this.tickAnalogClock(i, elementDate, immediate);
        }

        this.queue_relayout();

        if (DEBUG_CLOCK_MODE) {
            debugSeconds += 15;
            if (debugSeconds === 60) {
                debugMinutes += 15;
                debugSeconds = 0;
            }
            if (debugMinutes === 60) {
                debugHours += 1;
                debugMinutes = 0;
            }
        }
    }

    _createAnalogClock(data, index) {
        const clockFace = new St.Icon({
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            visible: data['ClockFace_Visible'] === 'true',
        });
        clockFace.elementIndex = index;

        const secondHand = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            y_expand: false,
            y_align: Clutter.ActorAlign.START,
            visible: data['SecondHand_Visible'] === 'true',
        });
        secondHand.elementIndex = index;

        const minuteHand = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            y_align: Clutter.ActorAlign.START,
        });
        minuteHand.elementIndex = index;

        const hourHand = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            y_align: Clutter.ActorAlign.START,
        });
        hourHand.elementIndex = index;

        const clockButton = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            visible: data['ClockButton_Visible'] === 'true',
        });
        clockButton.elementIndex = index;

        const analogClockGroup = new Clutter.Actor({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });

        analogClockGroup.add_actor(clockFace);
        this._clockFaces.push(clockFace);

        analogClockGroup.add_actor(hourHand);
        this._clockHourHands.push(hourHand);

        analogClockGroup.add_actor(minuteHand);
        this._clockMinuteHands.push(minuteHand);

        analogClockGroup.add_actor(secondHand);
        this._clockSecondHands.push(secondHand);

        analogClockGroup.add_actor(clockButton);
        this._clockButtons.push(clockButton);

        this.add_child(analogClockGroup);
    }

    getAnalogClockStyle(data, element) {
        let style = `color: ${data[`${element}_Color`]};`;

        const backgroundColor = data[`${element}_BackgroundColor`];
        const borderRadius = data[`${element}_BorderRadius`];
        const borderEnabled = data[`${element}_BorderEnabled`] === 'true';
        const shadowEnabled = data[`${element}_ShadowEnabled`] === 'true';
        const boxShadowEnabled = data[`${element}_BoxShadowEnabled`] === 'true';

        if (backgroundColor)
            style += `background-color: ${backgroundColor};`;
        if (borderRadius)
            style += `border-radius: ${borderRadius}px;`;

        if (borderEnabled) {
            const borderWidth = data[`${element}_BorderWidth`];
            const borderColor = data[`${element}_BorderColor`];
            if (borderWidth)
                style += `border: ${borderWidth}px;`;
            if (borderColor)
                style += `border-color: ${borderColor};`;
        }

        if (shadowEnabled) {
            const shadow = `${element}_Shadow`;
            style += `icon-shadow: ${data[`${shadow}X`]}px ${data[`${shadow}Y`]}px ${data[`${shadow}Blur`]}px ${data[`${shadow}Spread`]}px ${data[`${shadow}Color`]};`;
        }
        if (boxShadowEnabled) {
            const boxShadow = `${element}_BoxShadow`;
            style += `box-shadow: ${data[`${boxShadow}X`]}px ${data[`${boxShadow}Y`]}px ${data[`${boxShadow}Blur`]}px ${data[`${boxShadow}Spread`]}px ${data[`${boxShadow}Color`]};`;
        }
        return style;
    }

    tickAnalogClock(index, date, immediate) {
        // Keep hours in 12 hour format for analog clock
        if (date.getHours() >= 12)
            date.setHours(date.getHours() - 12);

        const degrees = 6; // each minute and second tick represents a 6 degree increment.
        const secondsInDegrees = date.getSeconds() * degrees;
        const minutesInDegrees = date.getMinutes() * degrees;
        const hoursInDegrees = date.getHours() * 30;

        const secondHand = this._clockSecondHands[index];
        if (secondHand.visible)
            this.tickClockHand(secondHand, secondsInDegrees, immediate);

        const minuteHand = this._clockMinuteHands[index];
        this.tickClockHand(minuteHand, minutesInDegrees, immediate);

        const hourHand = this._clockHourHands[index];
        this.tickClockHand(hourHand, hoursInDegrees + minutesInDegrees / 12, immediate);
    }

    tickClockHand(hand, rotationDegree, immediate) {
        hand.remove_all_transitions();
        if (rotationDegree === hand.rotation_angle_z)
            return;

        // Prevent the clock hand from spinning counter clockwise back to 0.
        if (rotationDegree === 0 && hand.rotation_angle_z !== 0)
            rotationDegree = 360;

        hand.ease({
            opacity: 255, // onComplete() seems to trigger instantly without this.
            rotation_angle_z: rotationDegree,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: immediate ? 0 : 300,
            onComplete: () => {
                if (rotationDegree === 360)
                    hand.rotation_angle_z = 0;
            },
        });
    }

    vfunc_button_press_event() {
        const event = Clutter.get_current_event();

        if (event.get_button() === 1) {
            this._setPopupTimeout();
        } else if (event.get_button() === 3) {
            this._popupMenu();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _onDragBegin() {
        if (this._menu)
            this._menu.close(true);
        this._removeMenuTimeout();

        this.isDragging = true;
        this._dragMonitor = {
            dragMotion: this._onDragMotion.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);

        const p = this.get_transformed_position();
        this._dragX = p[0];
        this._dragY = p[1];
    }

    _onDragMotion(dragEvent) {
        this.deltaX = dragEvent.x - (dragEvent.x - this._dragX);
        this.deltaY = dragEvent.y - (dragEvent.y - this._dragY);

        const p = this.get_transformed_position();
        this._dragX = p[0];
        this._dragY = p[1];

        return DND.DragMotionResult.CONTINUE;
    }

    _onDragEnd() {
        this.isDragging = false;
        if (this._dragMonitor) {
            DND.removeDragMonitor(this._dragMonitor);
            this._dragMonitor = null;
        }

        let [x, y] = [Math.round(this.deltaX), Math.round(this.deltaY)];
        this.set_position(x, y);

        if (!this._isOnScreen(x, y)) {
            [x, y] = this._keepOnScreen(x, y);
            this.ease({
                x,
                y,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        Me.settings.set_value('changed-data', new GLib.Variant('a{ss}', {
            'WidgetIndex': this.widgetIndex.toString(),
            'WidgetMoved': 'true',
        }));
        this.setClockElementData(WIDGET_DATA_INDEX, 'Location_X', x);
        this.setClockElementData(WIDGET_DATA_INDEX, 'Location_Y', y);
        debugLog(`drag end - (${x}, ${y})`);
    }

    getDragActorSource() {
        return this;
    }

    makeDraggable() {
        this._draggable = DND.makeDraggable(this);
        this._draggable._dragActorDropped = () => {
            this._draggable._animationInProgress = true;
            this._draggable._dragCancellable = false;
            this._draggable._dragState = DND.DragState.INIT;
            this._draggable._onAnimationComplete(this._draggable._dragActor, Clutter.get_current_event().get_time());
            return true;
        };

        this.dragBeginId = this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
        this.dragEndId = this._draggable.connect('drag-end', this._onDragEnd.bind(this));
    }

    _onHover() {
        if (!this.hover)
            this._removeMenuTimeout();
    }

    _removeMenuTimeout() {
        if (this._menuTimeoutId > 0) {
            GLib.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    }

    _setPopupTimeout() {
        this._removeMenuTimeout();
        this._menuTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
            this._menuTimeoutId = 0;
            this._popupMenu();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._menuTimeoutId, '[azclock] this.popupMenu');
    }

    _popupMenu() {
        this._removeMenuTimeout();

        if (!this._menu) {
            this._menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
            const lockWidgetItem = this._menu.addAction('', () => {
                this._menu.close();
                const lockWidget = this.getClockElementData(WIDGET_DATA_INDEX, 'Lock_Widget', 'bool');

                Me.settings.set_value('changed-data', new GLib.Variant('a{ss}', {
                    'WidgetIndex': this.widgetIndex.toString(),
                    'ElementIndex': WIDGET_DATA_INDEX.toString(),
                    'ElementType': 'Lock_Widget',
                }));

                this.setClockElementData(WIDGET_DATA_INDEX, 'Lock_Widget', !lockWidget);
            });

            const lockWidget = this.getClockElementData(WIDGET_DATA_INDEX, 'Lock_Widget', 'bool');
            lockWidgetItem.label.text = lockWidget ? _('Unlock') : _('Lock');

            this._menu.addAction(_('Desktop Clock Settings'), () => {
                ExtensionUtils.openPrefs();
            });

            Main.uiGroup.add_actor(this._menu.actor);
            this._menuManager.addMenu(this._menu);
        }

        this._menu.open();
        return false;
    }

    _onDestroy() {
        this._removeMenuTimeout();

        if (this._updateClockId) {
            GLib.source_remove(this._updateClockId);
            this._updateClockId = null;
        }

        if (this._dragMonitor) {
            DND.removeDragMonitor(this._dragMonitor);
            this._dragMonitor = null;
        }
    }
});


// eslint-disable-next-line jsdoc/require-jsdoc, no-unused-vars
function init() {
    ExtensionUtils.initTranslations(Me.metadata['gettext-domain']);
}

// eslint-disable-next-line jsdoc/require-jsdoc, no-unused-vars
function enable() {
    Me.settings = ExtensionUtils.getSettings();
    updateWidgetData();
    createClocks();
    startClockTimer();
}

// eslint-disable-next-line jsdoc/require-jsdoc, no-unused-vars
function disable() {
    Me.settings.set_value('changed-data', new GLib.Variant('a{ss}', {}));
    destroyClocks();

    destroyClockTimer();

    Me.settings.run_dispose();
    Me.settings = null;
}

/**
 *
 */
function startClockTimer() {
    _updateClockId = GLib.timeout_add(GLib.PRIORITY_HIGH, 1000, () => {
        for (const clock of widgets)
            clock.updateClock();

        return GLib.SOURCE_CONTINUE;
    });
}

/**
 *
 */
function destroyClockTimer() {
    if (_updateClockId) {
        GLib.source_remove(_updateClockId);
        _updateClockId = null;
    }
}

/**
 *
 * @param index
 */
function destroyClock(index) {
    const clock = widgets[index];
    widgets.splice(index, 1);
    clock.destroy();
}

/**
 *
 */
function destroyClocks() {
    if (_dataChangedTimeoutId) {
        GLib.source_remove(_dataChangedTimeoutId);
        _dataChangedTimeoutId = null;
    }
    extensionConnections.forEach((object, id) => {
        if (id)
            object.disconnect(id);
    });
    extensionConnections = null;

    for (const clock of widgets)
        clock.destroy();

    widgets = null;
}

/**
 *
 * @param index
 * @param updateDelay
 */
function createClock(index, updateDelay = 300) {
    const clock = new Clock(index);
    Main.layoutManager._backgroundGroup.add_child(clock);
    clock.updateClockComponents(updateDelay);
    return clock;
}

/**
 *
 */
function createClocks() {
    widgets = [];

    for (let i = 0; i < widgetData.length; i++) {
        const clock = createClock(i);
        widgets.push(clock);
    }

    extensionConnections = new Map();
    extensionConnections.set(Me.settings.connect('changed::widget-data', () => {
        if (_dataChangedTimeoutId)
            GLib.source_remove(_dataChangedTimeoutId);

        _dataChangedTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            updateWidgetData();
            clockDataChangedEvent();
            _dataChangedTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }), Me.settings);

    extensionConnections.set(Main.layoutManager.connect('monitors-changed', () => {
        if (global.display.get_n_monitors() === 0)
            return;

        debugLog('Monitors-changed event');
        updateWidgetData();
        for (const clock of widgets) {
            clock.setPositionFromSettings();
            updateWidgetData();
        }
    }), Main.layoutManager);
}

/**
 *
 */
function updateWidgetData() {
    debugLog('update widget data');
    widgetData = Utils.unpackData(Me.settings);
}

/**
 *
 */
function updateWidgetsIndex() {
    for (let i = 0; i < widgets.length; i++) {
        widgets[i].widgetIndex = i;
        widgets[i].z_position = widgets.length - i;
    }
}

/**
 *
 */
function clockDataChangedEvent() {
    const changedData = Me.settings.get_value('changed-data').deep_unpack();
    const widgetIndex = parseInt(changedData['WidgetIndex']);
    const elementIndex_ = parseInt(changedData['ElementIndex']);
    const elementType = changedData['ElementType'];
    const widgetDeleted = changedData['WidgetDeleted'];
    const widgetAdded = changedData['WidgetAdded'];
    const elementDeleted = changedData['ElementDeleted'];
    const elementAdded = changedData['ElementAdded'];
    const widgetMoved = changedData['WidgetMoved'];
    const widgetIndexChanged = changedData['WidgetIndexChanged'];
    const widgetIndexNew = parseInt(changedData['WidgetIndexNew']);
    const elementIndexChanged = changedData['ElementIndexChanged'];

    if (widgetIndex === undefined) {
        debugLog('update all widgets');

        for (const clock of widgets)
            clock.updateClockComponents();
    } else if (widgetIndexChanged) {
        debugLog(`widget index changed from ${widgetIndex} to ${widgetIndexNew}`);

        const movedWidget = widgets.splice(widgetIndex, 1)[0];
        widgets.splice(widgetIndexNew, 0, movedWidget);

        updateWidgetsIndex();
    } else if (widgetMoved) {
        debugLog(`widget ${widgetIndex} moved`);
    } else if (widgetAdded) {
        debugLog(`widget ${widgetIndex} created`);

        const clock = createClock(widgetIndex);
        widgets.push(clock);
        updateWidgetsIndex();
    } else if (widgetDeleted) {
        debugLog(`widget ${widgetIndex} deleted`);

        destroyClock(widgetIndex);
        updateWidgetsIndex();
    } else if (elementType === 'Lock_Widget') {
        debugLog(`widget ${widgetIndex} locked/unlocked`);

        const oldClock = widgets[widgetIndex];
        widgets[widgetIndex] = createClock(widgetIndex, 0);
        oldClock.destroy();
    } else if (elementDeleted || elementAdded || elementIndexChanged) {
        debugLog(`element added/deleted/index-changed at widget ${widgetIndex}`);

        widgets[widgetIndex].createClockElements();
        widgets[widgetIndex].updateClockComponents(0);
    } else {
        debugLog(`widget ${widgetIndex} element setting changed`);

        widgets[widgetIndex].updateClockComponents();
    }

    Me.settings.set_value('changed-data', new GLib.Variant('a{ss}', {}));
}
