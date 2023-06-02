const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {Adw, GObject, Gtk} = imports.gi;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const Settings = Me.imports.settings;
const {SubPage} = Settings.SubPage;

const CLOCK_STYLE_COUNT = 9;
const BUTTON_STYLE_COUNT = 5;

var AnalogClockSubPage = GObject.registerClass(
class AzClockAnalogClockSubPage extends SubPage {
    _init(settings, params) {
        super._init(settings, params);

        const timeZoneGroup = new Adw.PreferencesGroup();
        this.add(timeZoneGroup);

        const timeZoneRow = this.createTimeZoneRow();
        timeZoneGroup.add(timeZoneRow);

        const generalGroup = new Adw.PreferencesGroup({
            title: _('Clock Settings'),
        });
        this.add(generalGroup);

        const clockSizeRow = this.createSpinRow(_('Size'), 'Clock_Size', 100, 1000);
        generalGroup.add(clockSizeRow);

        const marginsExpanderRow = new Adw.ExpanderRow({
            title: _('Margins'),
        });
        generalGroup.add(marginsExpanderRow);

        const marginTopRow = this.createSpinRow(_('Top'), 'Element_Margin_Top', 0, 200);
        marginsExpanderRow.add_row(marginTopRow);
        const marginRightRow = this.createSpinRow(_('Right'), 'Element_Margin_Right', 0, 200);
        marginsExpanderRow.add_row(marginRightRow);
        const marginBottomRow = this.createSpinRow(_('Bottom'), 'Element_Margin_Bottom', 0, 200);
        marginsExpanderRow.add_row(marginBottomRow);
        const marginLeftRow = this.createSpinRow(_('Left'), 'Element_Margin_Left', 0, 200);
        marginsExpanderRow.add_row(marginLeftRow);

        const clockFaceGroup = new Adw.PreferencesGroup({
            title: _('Clock Face'),
        });
        this.add(clockFaceGroup);

        const clockStyleRow = this.createSpinRow(_('Style'), 'ClockFace_Style', 1, CLOCK_STYLE_COUNT);
        clockFaceGroup.add(clockStyleRow);

        const clockColorRow = this.createColorRow(_('Color'), 'ClockFace_Color');
        clockFaceGroup.add(clockColorRow);

        const clockBackgroundColorRow = this.createColorRow(_('Background Color'), 'ClockFace_BackgroundColor');
        clockFaceGroup.add(clockBackgroundColorRow);

        const borderEnabled = this.getClockElementData('ClockFace_BorderEnabled', 'bool');

        const borderOptionsRow = new Adw.ExpanderRow({
            title: _('Border'),
            show_enable_switch: true,
            enable_expansion: borderEnabled,
        });
        clockFaceGroup.add(borderOptionsRow);
        borderOptionsRow.connect('notify::enable-expansion', widget => {
            this.setClockElementData('ClockFace_BorderEnabled', widget.enable_expansion);
        });

        const borderWidthRow = this.createSpinRow(_('Border Width'), 'ClockFace_BorderWidth', 0, 15);
        borderOptionsRow.add_row(borderWidthRow);
        const borderColorRow = this.createColorRow(_('Border Color'), 'ClockFace_BorderColor');
        borderOptionsRow.add_row(borderColorRow);

        const shadowExpanderRow = this.createShadowExpanderRow(_('Inner Shadow'), 'ClockFace_Shadow');
        clockFaceGroup.add(shadowExpanderRow);

        const shadowOuterExpanderRow = this.createShadowExpanderRow(_('Outer Shadow'), 'ClockFace_BoxShadow');
        clockFaceGroup.add(shadowOuterExpanderRow);

        const enableSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this.getClockElementData('ClockFace_Visible', 'bool'),
        });
        enableSwitch.connect('notify::active', widget => {
            this.setClockElementData('ClockFace_Visible', widget.get_active());

            clockStyleRow.sensitive = widget.get_active();
            clockColorRow.sensitive = widget.get_active();
            clockBackgroundColorRow.sensitive = widget.get_active();
            borderOptionsRow.sensitive = widget.get_active();
            shadowExpanderRow.sensitive = widget.get_active();
            shadowOuterExpanderRow.sensitive = widget.get_active();
        });
        clockFaceGroup.set_header_suffix(enableSwitch);

        clockStyleRow.sensitive = enableSwitch.get_active();
        clockColorRow.sensitive = enableSwitch.get_active();
        clockBackgroundColorRow.sensitive = enableSwitch.get_active();
        borderOptionsRow.sensitive = enableSwitch.get_active();
        shadowExpanderRow.sensitive = enableSwitch.get_active();
        shadowOuterExpanderRow.sensitive = enableSwitch.get_active();

        this.createHandGroup('ClockButton', _('Button in Center'), BUTTON_STYLE_COUNT);
        this.createHandGroup('SecondHand', _('Second Hand'), CLOCK_STYLE_COUNT);
        this.createHandGroup('MinuteHand', _('Minute Hand'), CLOCK_STYLE_COUNT);
        this.createHandGroup('HourHand', _('Hour Hand'), CLOCK_STYLE_COUNT);
    }

    createHandGroup(elementType, title, maxStyles) {
        const handGroup = new Adw.PreferencesGroup({
            title: _(title),
        });
        this.add(handGroup);

        const styleRow = this.createSpinRow(_('Style'), `${elementType}_Style`, 1, maxStyles);
        handGroup.add(styleRow);

        const handColorRow = this.createColorRow(_('Color'), `${elementType}_Color`);
        handGroup.add(handColorRow);

        const shadowExpanderRow = this.createShadowExpanderRow(_('Shadow'), `${elementType}_Shadow`);
        handGroup.add(shadowExpanderRow);

        if (elementType === 'SecondHand' || elementType === 'ClockButton') {
            const enableSwitch = new Gtk.Switch({
                valign: Gtk.Align.CENTER,
                active: this.getClockElementData(`${elementType}_Visible`, 'bool'),
            });
            enableSwitch.connect('notify::active', widget => {
                this.setClockElementData(`${elementType}_Visible`, widget.get_active());

                styleRow.sensitive = widget.get_active();
                shadowExpanderRow.sensitive = widget.get_active();
                handColorRow.sensitive = widget.get_active();
            });
            handGroup.set_header_suffix(enableSwitch);

            styleRow.sensitive = enableSwitch.get_active();
            shadowExpanderRow.sensitive = enableSwitch.get_active();
            handColorRow.sensitive = enableSwitch.get_active();
        }
    }
});
