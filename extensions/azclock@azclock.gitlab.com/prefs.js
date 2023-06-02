const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {Adw, Gdk, Gio, GLib, GObject, Gtk} = imports.gi;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Utils = Me.imports.utils;
const _ = Gettext.gettext;

const {AboutPage} = Me.imports.settings.AboutPage;
const {DigitalClockSubPage} = Me.imports.settings.DigitalClockSubPage;
const {AnalogClockSubPage} = Me.imports.settings.AnalogClockSubPage;
const {TextLabelSubPage} = Me.imports.settings.TextLabelSubPage;
const {WidgetSubPage} = Me.imports.settings.WidgetSubPage;

/**
 *
 */
function init() {
    ExtensionUtils.initTranslations();
}

/**
 *
 * @param window
 */
function fillPreferencesWindow(window) {
    const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
    if (!iconTheme.get_search_path().includes(`${Me.path}/media`))
        iconTheme.add_search_path(`${Me.path}/media`);

    const settings = ExtensionUtils.getSettings();

    window.can_navigate_back = true;

    const homePage = new HomePage(settings);
    window.add(homePage);

    const aboutPage = new AboutPage();
    window.add(aboutPage);
}

var HomePage = GObject.registerClass(
class azClock_HomePage extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: _('Settings'),
            icon_name: 'preferences-system-symbolic',
            name: 'HomePage',
        });

        this._settings = settings;
        this.widgetRows = [];

        const addClockButton = new Gtk.Button({
            halign: Gtk.Align.START,
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Add a new widget'),
        });
        addClockButton.connect('clicked', () => {
            const dialog = new AddWidgetsDialog(this._settings, this);
            dialog.show();
            dialog.connect('response', (_w, response) => {
                if (response === Gtk.ResponseType.APPLY) {
                    this.createRows();
                    dialog.destroy();
                }
            });
        });
        this.clocksGroup = new Adw.PreferencesGroup();
        this.add(this.clocksGroup);
        this.clocksGroup.set_header_suffix(addClockButton);
        this.createRows();
    }


    createRows(preserveExpanded) {
        const expandedRows = [];
        for (let row of this.widgetRows) {
            expandedRows.push(row.expanded);
            this.clocksGroup.remove(row);
            row = null;
        }
        this.widgetRows = [];

        const widgetsData = this._settings.get_value('widget-data').deep_unpack();

        for (let i = 0; i < widgetsData.length; i++) {
            const widgetRow = this._createwidgetRow(i);
            widgetRow.expanded = preserveExpanded ? expandedRows[i] : false;
            this.clocksGroup.add(widgetRow);
        }
    }

    _createwidgetRow(widgetIndex) {
        const widgetsData = this._settings.get_value('widget-data').deep_unpack();
        const widgetData = widgetsData[widgetIndex];
        const elementData = widgetData[0];
        // Data for the widget is always the first element in array.
        const widgetRow = new WidgetRow(this._settings, this, {
            title: `<b>${elementData['Name']}</b>`,
            expanded: false,
            widget_index: widgetIndex,
        });
        widgetRow.use_markup = true;

        widgetRow.connect('drag-drop-prepare', () => {
            for (const row of this.widgetRows)
                row.expanded = false;
        });

        widgetRow.connect('drag-drop-done', (_widget, oldIndex, newIndex) => {
            const widgetData = this._settings.get_value('widget-data').deep_unpack();

            const movedData = widgetData.splice(oldIndex, 1)[0];
            widgetData.splice(newIndex, 0, movedData);

            this._settings.set_value('changed-data', new GLib.Variant('a{ss}', {
                'WidgetIndex': oldIndex.toString(),
                'WidgetIndexNew': newIndex.toString(),
                'WidgetIndexChanged': 'true',
            }));

            this._settings.set_value('widget-data', new GLib.Variant('aaa{ss}', widgetData));
            this.createRows();
        });

        this.widgetRows.push(widgetRow);
        return widgetRow;
    }
});

var WidgetRow = GObject.registerClass({
    Properties: {
        'widget-index': GObject.ParamSpec.int(
            'widget-index', 'widget-index', 'widget-index',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXINT32, 0),
    },
    Signals: {
        'drag-drop-done': {param_types: [GObject.TYPE_UINT, GObject.TYPE_UINT]},
        'drag-drop-prepare': {},
    },
}, class AzClock_WidgetRow extends Adw.ExpanderRow {
    _init(settings, homePage, params) {
        super._init(params);

        this._params = params;
        this._settings = settings;
        this._homePage = homePage;

        const widgetsData = this._settings.get_value('widget-data').deep_unpack();
        const widgetData = widgetsData[this.widget_index];
        const elementData = widgetData[0];

        this.dragIcon = new Gtk.Image({
            gicon: Gio.icon_new_for_string('list-drag-handle-symbolic'),
            pixel_size: 12,
        });
        this.add_prefix(this.dragIcon);

        const dragSource = new Gtk.DragSource({actions: Gdk.DragAction.MOVE});
        this.add_controller(dragSource);

        const dropTarget = new Gtk.DropTargetAsync({actions: Gdk.DragAction.MOVE});
        this.add_controller(dropTarget);

        dragSource.connect('drag-begin', (self, gdkDrag) => {
            this._dragParent = self.get_widget().get_parent();
            this._dragParent.dragRow = this;

            const alloc = this.get_allocation();
            const dragWidget = self.get_widget().createDragRow(alloc);
            this._dragParent.dragWidget = dragWidget;

            const icon = Gtk.DragIcon.get_for_drag(gdkDrag);
            icon.set_child(dragWidget);

            gdkDrag.set_hotspot(this._dragParent.dragX, this._dragParent.dragY);
        });

        dragSource.connect('prepare', (self, x, y) => {
            this.emit('drag-drop-prepare');

            this.set_state_flags(Gtk.StateFlags.NORMAL, true);
            const parent = self.get_widget().get_parent();
            // store drag start cursor location
            parent.dragX = x;
            parent.dragY = y;
            return new Gdk.ContentProvider();
        });

        dragSource.connect('drag-end', (_self, _gdkDrag, deleteData) => {
            this._dragParent.dragWidget = null;
            this._dragParent.drag_unhighlight_row();
            deleteData = true;
        });

        dropTarget.connect('drag-enter', self => {
            const parent = self.get_widget().get_parent();
            const widget = self.get_widget();

            parent.drag_highlight_row(widget);
        });

        dropTarget.connect('drag-leave', self => {
            const parent = self.get_widget().get_parent();
            parent.drag_unhighlight_row();
        });

        dropTarget.connect('drop', (_self, gdkDrop) => {
            const parent = this.get_parent();
            const dragRow = parent.dragRow; // The row being dragged.
            const dragRowStartIndex = dragRow.get_index();
            const dragRowNewIndex = this.get_index();

            gdkDrop.read_value_async(AzClock_WidgetRow, 1, null, () => gdkDrop.finish(Gdk.DragAction.MOVE));

            // The drag row hasn't moved
            if (dragRowStartIndex === dragRowNewIndex)
                return true;

            this.emit('drag-drop-done', dragRowStartIndex, dragRowNewIndex);
            return true;
        });

        const widgetSettingPage = new WidgetSubPage(this._settings, {
            title: elementData['Name'],
            widget_index: this.widget_index,
            element_index: 0,
        });
        widgetSettingPage.connect('notify::title', () => this.title = `<b>${widgetSettingPage.title}</b>`);

        const deleteButton = new Gtk.Button({
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
            hexpand: false,
            icon_name: 'user-trash-symbolic',
            css_classes: ['flat'],
            tooltip_text: _('Delete widget'),
        });
        deleteButton.connect('clicked', widget => {
            const dialog = new Gtk.MessageDialog({
                text: `<b>${_('Delete %s?').format(elementData['Name'])}</b>`,
                secondary_text: _('Please confirm you wish to delete %s?').format(elementData['Name']),
                use_markup: true,
                buttons: Gtk.ButtonsType.YES_NO,
                message_type: Gtk.MessageType.WARNING,
                transient_for: this.get_root(),
                modal: true,
            });
            dialog.connect('response', (widget, response) => {
                if (response == Gtk.ResponseType.YES) {
                    const widgetData = this._settings.get_value('widget-data').deep_unpack();
                    widgetData.splice(this.widget_index, 1);
                    this._settings.set_value('changed-data', new GLib.Variant('a{ss}', {
                        'WidgetIndex': this.widget_index.toString(),
                        'WidgetDeleted': 'true',
                    }));
                    this._settings.set_value('widget-data', new GLib.Variant('aaa{ss}', widgetData));
                    this._homePage.createRows();
                }
                dialog.destroy();
            });
            dialog.show();
        });
        this.add_action(deleteButton);

        const configureButton = new Gtk.Button({
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
            hexpand: false,
            icon_name: 'emblem-system-symbolic',
            css_classes: ['flat'],
            tooltip_text: _('Configure widget'),
        });
        configureButton.connect('clicked', widget => {
            this.get_root().present_subpage(widgetSettingPage);
            widgetSettingPage.resetScrollAdjustment();
        });

        this.add_prefix(configureButton);

        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Add element to widget'),
        });

        addButton.connect('clicked', () => {
            const dialog = new AddElementsDialog(this._settings, this, {
                widget_index: this.widget_index,
                widget_title: widgetSettingPage.title,
            });
            dialog.show();
            dialog.connect('response', (_w, response) => {
                if (response === Gtk.ResponseType.APPLY) {
                    this._homePage.createRows(true);
                    dialog.destroy();
                }
            });
        });
        this.add_action(addButton);

        // Skip first element (widgetdata) in array.
        for (let i = 1; i < widgetData.length; i++) {
            const row = new ElementRow(this._settings, {
                title: widgetData[i]['Name'] ? widgetData[i]['Name'] : _('Element %d').format(i),
                widget_title: elementData['Name'],
                widget_index: this.widget_index,
                element_index: i,
                last_element_index: widgetData.length - 1,
            });
            this.add_row(row);
            row.connect('response', (_w, response) => {
                if (response === Gtk.ResponseType.DELETE_EVENT)
                    this._homePage.createRows(true);
            });

            row.connect('notify::element-index', () => {
                const widgetsData = this._settings.get_value('widget-data').deep_unpack();
                const widgetData = widgetsData[this.widget_index];

                const movedElement = widgetData.splice(i, 1)[0];
                widgetData.splice(row.element_index, 0, movedElement);

                widgetsData.splice(this.widget_index, 1, widgetData);

                this._settings.set_value('changed-data', new GLib.Variant('a{ss}', {
                    'WidgetIndex': this.widget_index.toString(),
                    'ElementIndex': i.toString(),
                    'ElementIndexNew': row.element_index.toString(),
                    'ElementIndexChanged': 'true',
                }));

                this._settings.set_value('widget-data', new GLib.Variant('aaa{ss}', widgetsData));
                this._homePage.createRows(true);
            });

            row.connect('activated', () => {
                let settingPage;
                if (widgetData[i]['Element_Type'] === 'Digital_Clock') {
                    settingPage = new DigitalClockSubPage(this._settings, {
                        title: _(row.title),
                        widget_index: this.widget_index,
                        element_index: i,
                    });
                } else if (widgetData[i]['Element_Type'] === 'Analog_Clock') {
                    settingPage = new AnalogClockSubPage(this._settings, {
                        title: _(row.title),
                        widget_index: this.widget_index,
                        element_index: i,
                    });
                } else if (widgetData[i]['Element_Type'] === 'Text_Label') {
                    settingPage = new TextLabelSubPage(this._settings, {
                        title: _(row.title),
                        widget_index: this.widget_index,
                        element_index: i,
                    });
                }
                settingPage.connect('notify::title', () => row.title = settingPage.title);
                this.get_root().present_subpage(settingPage);
                settingPage.resetScrollAdjustment();
            });
        }
    }

    createDragRow(alloc) {
        const dragWidget = new Gtk.ListBox();
        dragWidget.set_size_request(alloc.width, -1);

        const dragRow = new WidgetRow(this._settings, this._homePage, this._params);
        dragWidget.append(dragRow);
        dragWidget.drag_highlight_row(dragRow);

        return dragWidget;
    }
});

var ElementRow = GObject.registerClass({
    Properties: {
        'widget-title': GObject.ParamSpec.string(
            'widget-title', 'widget-title', 'widget-title',
            GObject.ParamFlags.READWRITE,
            ''),
        'widget-index': GObject.ParamSpec.int(
            'widget-index', 'widget-index', 'widget-index',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXINT32, 0),
        'element-index': GObject.ParamSpec.int(
            'element-index', 'element-index', 'element-index',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXINT32, 0),
        'last-element-index': GObject.ParamSpec.int(
            'last-element-index', 'last-element-index', 'last-element-index',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXINT32, 0),
        'first-element-index': GObject.ParamSpec.int(
            'first-element-index', 'first-element-index', 'first-element-index',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXINT32, 1),
    },
    Signals: {
        'response': {param_types: [GObject.TYPE_INT]},
    },
}, class azClock_ElementRow extends Adw.ActionRow {
    _init(settings, params) {
        super._init({
            activatable: true,
            ...params,
        });
        this._settings = settings;

        const navBox = new Gtk.Box({
            css_classes: ['linked'],
            spacing: 0,
            visible: !(this.element_index === this.first_element_index && this.element_index === this.last_element_index),
        });
        this.add_suffix(navBox);

        const upButton = new Gtk.Button({
            icon_name: 'go-up-symbolic',
            valign: Gtk.Align.CENTER,
            sensitive: this.element_index !== this.first_element_index,
            tooltip_text: _('Move element up in order'),
        });
        navBox.append(upButton);
        upButton.connect('clicked', () => {
            this.element_index--;
        });

        const downButton = new Gtk.Button({
            icon_name: 'go-down-symbolic',
            valign: Gtk.Align.CENTER,
            sensitive: this.element_index !== this.last_element_index,
            tooltip_text: _('Move element down in order'),
        });
        navBox.append(downButton);
        downButton.connect('clicked', () => {
            this.element_index++;
        });

        const deleteButton = new Gtk.Button({
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
            hexpand: false,
            icon_name: 'user-trash-symbolic',
            css_classes: ['flat'],
            margin_end: 6,
            tooltip_text: _('Delete element from widget'),
        });
        deleteButton.connect('clicked', widget => {
            const dialog = new Gtk.MessageDialog({
                text: `<b>${_('Delete %s?').format(this.title)}</b>`,
                secondary_text: _('Please confirm you wish to delete this element from %s.').format(this.widget_title),
                use_markup: true,
                buttons: Gtk.ButtonsType.YES_NO,
                message_type: Gtk.MessageType.WARNING,
                transient_for: this.get_root(),
                modal: true,
            });
            dialog.connect('response', (widget, response) => {
                if (response == Gtk.ResponseType.YES) {
                    const data = settings.get_value('widget-data').deep_unpack();
                    data[this.widget_index].splice(this.element_index, 1);

                    settings.set_value('changed-data', new GLib.Variant('a{ss}', {
                        'WidgetIndex': this.widget_index.toString(),
                        'ElementDeleted': 'true',
                    }));

                    settings.set_value('widget-data', new GLib.Variant('aaa{ss}', data));
                    this.emit('response', Gtk.ResponseType.DELETE_EVENT);
                }
                dialog.destroy();
            });
            dialog.show();
        });
        this.add_suffix(deleteButton);

        const goNextImage = new Gtk.Image({
            gicon: Gio.icon_new_for_string('go-next-symbolic'),
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: false,
            vexpand: false,
        });

        this.add_suffix(goNextImage);
    }
});

var DialogWindow = GObject.registerClass({
    Properties: {
        'widget-index': GObject.ParamSpec.int(
            'widget-index', 'widget-index', 'widget-index',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXINT32, 0),
        'element-index': GObject.ParamSpec.int(
            'element-index', 'element-index', 'element-index',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXINT32, 0),
        'widget-title': GObject.ParamSpec.string(
            'widget-title', 'widget-title', 'widget-title',
            GObject.ParamFlags.READWRITE,
            ''),
    },
    Signals: {
        'response': {param_types: [GObject.TYPE_INT]},
    },
}, class AzClock_DialogWindow extends Adw.PreferencesWindow {
    _init(title, parent, params) {
        super._init({
            title,
            transient_for: parent.get_root(),
            modal: true,
            search_enabled: true,
            ...params,
        });
        this.page = new Adw.PreferencesPage();
        this.pageGroup = new Adw.PreferencesGroup();

        this.add(this.page);
        this.page.add(this.pageGroup);
    }
});

var AddWidgetsDialog = GObject.registerClass(
class AzClock_AddWidgetsDialog extends DialogWindow {
    _init(settings, parent) {
        super._init(_('Add Widget'), parent);
        this._settings = settings;
        this.search_enabled = false;
        this.set_default_size(550, -1);

        this.pageGroup.title = _('Preset Widgets');
        this.pageGroup.add(this.addPresetWidget(_('Digital Clock Widget'), WidgetType.DIGITAL));
        this.pageGroup.add(this.addPresetWidget(_('Analog Clock Widget'), WidgetType.ANALOG));
        this.pageGroup.add(this.addPresetWidget(_('Empty Widget'), WidgetType.CUSTOM, _('Add your own custom clock elements')));

        const data = this._settings.get_value('widget-data').deep_unpack();
        this.cloneGroup = new Adw.PreferencesGroup({
            title: _('Clone existing Widget'),
        });
        this.cloneGroup.use_markup = true;
        this.page.add(this.cloneGroup);

        for (let i = 0; i < data.length; i++)
            this.cloneGroup.add(this.addPresetWidget(`${data[i][0]['Name']}`, data[i]));
    }

    addPresetWidget(title, widgetType, subtitle) {
        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
        });

        addButton.connect('clicked', () => {
            const data = this._settings.get_value('widget-data').deep_unpack();
            if (widgetType === WidgetType.DIGITAL)
                data.push(Utils.DigitalClockSettings);
            else if (widgetType === WidgetType.ANALOG)
                data.push(Utils.AnalogClockSettings);
            else if (widgetType === WidgetType.CUSTOM)
                data.push(Utils.EmptyWidgetSettings);
            else
                data.push(widgetType);

            this._settings.set_value('changed-data', new GLib.Variant('a{ss}', {
                'WidgetIndex': (data.length - 1).toString(),
                'WidgetAdded': 'true',
            }));

            this._settings.set_value('widget-data', new GLib.Variant('aaa{ss}', data));
            this.emit('response', Gtk.ResponseType.APPLY);
        });

        const row = new Adw.ActionRow({
            subtitle: subtitle ?? '',
            title,
            activatable_widget: addButton,
        });

        row.add_suffix(addButton);
        return row;
    }
});

var AddElementsDialog = GObject.registerClass(
class AzClock_AddElementsDialog extends DialogWindow {
    _init(settings, parent, params) {
        super._init(_('Add Element to %s').format(params.widget_title), parent, params);
        this._settings = settings;
        this.search_enabled = false;
        this.set_default_size(550, -1);

        this.pageGroup.title = _('Preset Elements');
        this.pageGroup.add(this.addPresetWidget(_('Date Label'), ElementType.DATE));
        this.pageGroup.add(this.addPresetWidget(_('Time Label'), ElementType.TIME));
        this.pageGroup.add(this.addPresetWidget(_('Text Label'), ElementType.TEXT));
        this.pageGroup.add(this.addPresetWidget(_('Analog Clock'), ElementType.ANALOG));

        const data = this._settings.get_value('widget-data').deep_unpack();
        this.cloneGroup = new Adw.PreferencesGroup({
            title: _('Clone existing Element'),
        });
        this.cloneGroup.use_markup = true;
        this.page.add(this.cloneGroup);

        for (let i = 0; i < data.length; i++) {
            for (let j = 1; j < data[i].length; j++)
                this.cloneGroup.add(this.addPresetWidget(`${data[i][j]['Name']} <span font-size='small'><i>(${data[i][0]['Name']})</i></span>`, data[i][j]));
        }
    }

    addPresetWidget(title, widgetType, subtitle) {
        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
        });

        addButton.connect('clicked', () => {
            const data = this._settings.get_value('widget-data').deep_unpack();
            if (widgetType === ElementType.DATE)
                data[this.widget_index].push(Utils.DigitalClockSettings[2]);
            else if (widgetType === ElementType.TIME)
                data[this.widget_index].push(Utils.DigitalClockSettings[1]);
            else if (widgetType === ElementType.TEXT)
                data[this.widget_index].push(Utils.TextLabel);
            else if (widgetType === ElementType.ANALOG)
                data[this.widget_index].push(Utils.AnalogClockSettings[1]);
            else
                data[this.widget_index].push(widgetType);

            this._settings.set_value('changed-data', new GLib.Variant('a{ss}', {
                'WidgetIndex': this.widget_index.toString(),
                'ElementAdded': 'true',
            }));

            this._settings.set_value('widget-data', new GLib.Variant('aaa{ss}', data));
            this.emit('response', Gtk.ResponseType.APPLY);
        });

        const row = new Adw.ActionRow({
            subtitle: subtitle ?? '',
            title,
            activatable_widget: addButton,
        });

        row.add_suffix(addButton);
        return row;
    }
});

const WidgetType = {
    DIGITAL: 0,
    ANALOG: 1,
    CUSTOM: 2,
};

const ElementType = {
    DATE: 0,
    TIME: 1,
    ANALOG: 2,
    TEXT: 3,
};
