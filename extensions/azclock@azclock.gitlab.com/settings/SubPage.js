const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {Adw, Gdk, GLib, GObject, Gtk} = imports.gi;

const GWeather = getGWeatherVersion();

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Utils = Me.imports.utils;
const _ = Gettext.gettext;

const MAX_LOCATIONS = 12;

/**
 * Check for GWeather v4 package.
 * GWeather v3 throws errors wit Gtk4
 */
function getGWeatherVersion() {
    try {
        imports.gi.versions.GWeather = '4.0';
        return imports.gi.GWeather;
    } catch (e) {
        return null;
    }
}

var SubPage = GObject.registerClass({
    Properties: {
        'title': GObject.ParamSpec.string(
            'title', 'title', 'title',
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
    },
}, class AzClockSubPage extends Gtk.Box {
    _init(settings, params) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            ...params,
        });

        this._settings = settings;

        this.headerLabel = new Adw.WindowTitle({
            title: _(this.title),
        });

        this.headerBar = new Adw.HeaderBar({
            title_widget: this.headerLabel,
            decoration_layout: '',
        });

        this.append(this.headerBar);
        this.page = new PrefsPage();
        this.append(this.page);

        const nameGroup = new Adw.PreferencesGroup();
        this.add(nameGroup);

        const nameEntry = new Gtk.Entry({
            valign: Gtk.Align.CENTER,
            width_chars: 20,
            text: this.getClockElementData('Name'),
        });
        nameEntry.connect('changed', () => {
            this.setClockElementData('Name', nameEntry.get_text());
            this.headerLabel.title = nameEntry.get_text();
            this.title = nameEntry.get_text();
        });
        const nameRow = new Adw.ActionRow({
            title: _('Element Name'),
            activatable_widget: nameEntry,
        });
        nameRow.add_suffix(nameEntry);
        nameGroup.add(nameRow);

        const backButton = new Gtk.Button({
            icon_name: 'go-previous-symbolic',
            tooltip_text: _('Back'),
            css_classes: ['flat'],
        });

        backButton.connect('clicked', () => {
            const window = this.get_root();
            window.close_subpage();
        });

        this.headerBar.pack_start(backButton);
    }

    add(widget) {
        this.page.add(widget);
    }

    resetScrollAdjustment() {
        const maybeScrolledWindowChild = [...this.page][0];

        if (maybeScrolledWindowChild instanceof Gtk.ScrolledWindow)
            maybeScrolledWindowChild.vadjustment.value = 0;
    }

    createShadowExpanderRow(title, elementType) {
        const shadowEnabled = this.getClockElementData(`${elementType}Enabled`, 'bool');
        const shadowExpanderRow = new Adw.ExpanderRow({
            title: _(title),
            show_enable_switch: true,
            expanded: false,
            enable_expansion: shadowEnabled,
        });
        shadowExpanderRow.connect('notify::enable-expansion', widget => {
            this.setClockElementData(`${elementType}Enabled`, widget.enable_expansion);
        });

        const shadowColorRow = this.createColorRow(_('Shadow Color'), `${elementType}Color`);
        shadowExpanderRow.add_row(shadowColorRow);
        const xOffsetRow = this.createSpinRow(_('Shadow X Offset'), `${elementType}X`, -15, 15);
        shadowExpanderRow.add_row(xOffsetRow);
        const yOffsetRow = this.createSpinRow(_('Shadow Y Offset'), `${elementType}Y`, -15, 15);
        shadowExpanderRow.add_row(yOffsetRow);
        const spreadRow = this.createSpinRow(_('Shadow Spread'), `${elementType}Spread`, 0, 15);
        shadowExpanderRow.add_row(spreadRow);
        const blurRow = this.createSpinRow(_('Shadow Blur'), `${elementType}Blur`, 0, 15);
        shadowExpanderRow.add_row(blurRow);
        return shadowExpanderRow;
    }

    createSpinRow(title, setting, lower, upper, digits = 0) {
        const value = this.getClockElementData(setting, 'int') || 0;
        const spinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower, upper, step_increment: 1, page_increment: 1, page_size: 0,
            }),
            climb_rate: 1,
            digits,
            numeric: true,
            valign: Gtk.Align.CENTER,
        });
        spinButton.set_value(value);
        spinButton.connect('value-changed', widget => {
            this.setClockElementData(setting, widget.get_value());
        });
        const spinRow = new Adw.ActionRow({
            title: _(title),
            activatable_widget: spinButton,
        });

        spinRow.setValue = newValue => {
            spinButton.set_value(newValue);
        };

        spinRow.add_suffix(spinButton);
        return spinRow;
    }

    createColorRow(title, setting) {
        const value = this.getClockElementData(setting);
        let rgba = new Gdk.RGBA();
        rgba.parse(value ?? '');
        const colorButton = new Gtk.ColorButton({
            rgba,
            use_alpha: true,
            valign: Gtk.Align.CENTER,
        });
        colorButton.connect('color-set', widget => {
            this.setClockElementData(setting, widget.get_rgba().to_string());
        });
        const colorRow = new Adw.ActionRow({
            title: _(title),
            activatable_widget: colorButton,
        });
        colorRow.add_suffix(colorButton);

        colorRow.setValue = newValue => {
            rgba = new Gdk.RGBA();
            rgba.parse(newValue);
            colorButton.set_rgba(rgba);
        };
        return colorRow;
    }

    createTimeZoneRow() {
        const timeZoneRow = new Adw.ActionRow({
            title: _('Time Zone'),
            activatable: true,
        });

        const timeZoneExpanderRow = new Adw.ExpanderRow({
            title: _('Override Time Zone'),
            show_enable_switch: true,
            expanded: this.getClockElementData('TimeZoneOverrideEnabled', 'bool'),
            enable_expansion: this.getClockElementData('TimeZoneOverrideEnabled', 'bool'),
        });
        timeZoneExpanderRow.connect('notify::enable-expansion', widget => {
            this.setClockElementData('TimeZoneOverrideEnabled', widget.enable_expansion);
        });
        timeZoneExpanderRow.add_row(timeZoneRow);

        if (!GWeather) {
            const linkButton = new Gtk.LinkButton({
                label: _('Time Zones Guide'),
                uri: 'https://en.wikipedia.org/wiki/List_of_tz_database_time_zones#List',
                css_classes: ['caption'],
                valign: Gtk.Align.CENTER,
            });
            timeZoneExpanderRow.add_action(linkButton);
            timeZoneExpanderRow.subtitle = `${_('Search Disabled')}\n${_('Missing dependency GWeather v4')}`;
            timeZoneRow.title = _('Time Zone Database Name');

            const timeZoneEntry = new Gtk.Entry({
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.FILL,
                hexpand: true,
                text: this.getClockElementData('TimeZoneOverride') || 'UTC',
            });

            const timeZoneApplyButton = new Gtk.Button({
                icon_name: 'object-select-symbolic',
                tooltip_text: _('Set Time Zone'),
                valign: Gtk.Align.CENTER,
            });
            timeZoneApplyButton.connect('clicked', () => {
                this.setClockElementData('TimeZoneOverride', timeZoneEntry.get_text());
            });

            timeZoneRow.add_suffix(timeZoneEntry);
            timeZoneRow.add_suffix(timeZoneApplyButton);

            return timeZoneExpanderRow;
        }

        const timeZoneLabel = new Gtk.Label({
            label: this.getClockElementData('TimeZone') ?? this.getClockElementData('TimeZoneOverride'),
            use_markup: true,
        });
        const goNext = new Gtk.Image({icon_name: 'go-next-symbolic'});

        timeZoneRow.add_suffix(timeZoneLabel);
        timeZoneRow.add_suffix(goNext);

        timeZoneRow.connect('activated', () => {
            const timeZoneDialog = new TimeZoneDialog({
                title: _('Select Time Zone'),
                transient_for: this.get_root(),
                modal: true,
            });
            timeZoneDialog.show();

            timeZoneDialog.connect('time-zone-changed', (_self, timeZone, label) => {
                this.setClockElementData('TimeZoneOverride', timeZone);
                this.setClockElementData('TimeZone', label);
                timeZoneLabel.label = label;
            });
        });

        return timeZoneExpanderRow;
    }

    getClockElementData(elementType, parseType) {
        return Utils.getData(Utils.unpackData(this._settings),
            this.widget_index, this.element_index, elementType, parseType) || null;
    }

    setClockElementData(elementType, newValue) {
        const changedData = this.getChangedData(elementType);
        this._settings.set_value('changed-data', new GLib.Variant('a{ss}', changedData));
        Utils.setData(Utils.unpackData(this._settings), this.widget_index, this.element_index, elementType, newValue);
    }

    getChangedData(elementType) {
        return {
            'WidgetIndex': this.widget_index.toString(),
            'ElementIndex': this.element_index.toString(),
            'ElementType': elementType,
        };
    }
});

var PrefsPage = GObject.registerClass(
class AzClockPrefsPage extends Adw.PreferencesPage {
    _init(params) {
        super._init(params);
        this.children = [];
    }

    add(page) {
        this.children.push(page);
        super.add(page);
    }
});

var TimeZoneDialog = GObject.registerClass({
    Signals: {
        'time-zone-changed': {param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING]},
    },
}, class AzClockTimeZoneDialog extends Adw.Window {
    _init(params) {
        super._init({
            ...params,
            default_width: 400,
            default_height: 540,
        });

        this._locationsRows = [];

        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.FILL,
            vexpand: true,
        });
        this.set_content(mainBox);

        const headerBar = new Adw.HeaderBar({
            show_start_title_buttons: true,
            show_end_title_buttons: true,
        });
        mainBox.append(headerBar);

        const searchEntry = new Gtk.SearchEntry();
        const searchBar = new Gtk.SearchBar({
            search_mode_enabled: true,
            child: searchEntry,
        });
        mainBox.append(searchBar);

        const stack = new Gtk.Stack();
        mainBox.append(stack);

        const page = new Adw.PreferencesPage({
            valign: Gtk.Align.FILL,
            vexpand: true,
        });
        stack.add_named(page, 'MainPage');

        const statusPage = new Adw.StatusPage({
            title: _('Search for a City'),
            icon_name: 'system-search-symbolic',
        });
        stack.add_named(statusPage, 'StatusPage');

        this._searchResultsGroup = new Adw.PreferencesGroup({
            valign: Gtk.Align.FILL,
        });
        page.add(this._searchResultsGroup);

        stack.set_visible_child_name('StatusPage');

        searchEntry.connect('search-changed', () => {
            for (let i = this._locationsRows.length - 1; i >= 0; i -= 1) {
                this._searchResultsGroup.remove(this._locationsRows[i]);
                this._locationsRows.pop();
            }

            if (searchEntry.text === '') {
                // EMPTY SEARCH
                statusPage.title = _('Search for a City');
                stack.set_visible_child_name('StatusPage');
                return;
            }

            const search = searchEntry.text.normalize().toLowerCase();

            const world = GWeather.Location.get_world();

            this.queryLocations(world, search);

            if (this._locationsRows.length === 0) {
                // NO RESULTS
                statusPage.title = _('No results.');
                stack.set_visible_child_name('StatusPage');
                return;
            }

            stack.set_visible_child_name('MainPage');

            this._locationsRows.sort((a, b) => {
                var nameA = a.location.get_sort_name();
                var nameB = b.location.get_sort_name();
                return nameA.localeCompare(nameB);
            });

            this._locationsRows.forEach(row => {
                this._searchResultsGroup.add(row);
            });
        });
    }

    queryLocations(location, search) {
        if (this._locationsRows.length >= MAX_LOCATIONS)
            return;

        switch (location.get_level()) {
        case GWeather.LocationLevel.CITY: {
            const containsName = location.get_sort_name().includes(search);

            let countryName = location.get_country_name();
            if (countryName != null)
                countryName = countryName.normalize().toLowerCase();

            const containsCountryName = countryName != null && countryName.includes(search);

            if (containsName || containsCountryName) {
                const row = this.createLocationRow(location);
                this._locationsRows.push(row);
            }
            return;
        }
        case GWeather.LocationLevel.NAMED_TIMEZONE:
            if (location.get_sort_name().includes(search)) {
                const row = this.createLocationRow(location);
                this._locationsRows.push(row);
            }
            return;
        default:
            break;
        }

        let loc = location.next_child(null);
        while (loc !== null) {
            this.queryLocations(loc, search);
            if (this._locationsRows.length >= MAX_LOCATIONS)
                return;

            loc = location.next_child(loc);
        }
    }

    createLocationRow(location) {
        const interval = location.get_timezone().find_interval(GLib.TimeType.UNIVERSAL, Gdk.CURRENT_TIME);
        const offset = location.get_timezone().get_offset(interval) / 3600;
        const offsetString = offset >= 0 ? `+${offset}` : offset;

        const gTimeZone = GLib.TimeZone.new(location.get_timezone_str());
        const localDateTime = GLib.DateTime.new_now(gTimeZone);
        const abbreviation = localDateTime.get_timezone_abbreviation();

        const hasCountry = location.get_country_name();

        const title = hasCountry ? `${location.get_name()}, ${location.get_country_name()}` : location.get_name();

        const timeZoneRow = new Adw.ActionRow({
            title,
            subtitle: `${location.get_timezone_str()} • ${abbreviation} (UTC ${offsetString})`,
            activatable: true,
        });
        timeZoneRow.use_markup = true;
        timeZoneRow.location = location;

        timeZoneRow.connect('activated', () => {
            this.emit('time-zone-changed', location.get_timezone_str(), `${title} • ${abbreviation}`);
            this.close();
        });

        return timeZoneRow;
    }
});
