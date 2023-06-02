const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {Adw, GObject, Gtk} = imports.gi;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const Settings = Me.imports.settings;
const {SubPage} = Settings.SubPage;

var WidgetSubPage = GObject.registerClass(
class AzClockWidgetClockSubPage extends SubPage {
    _init(settings, params) {
        super._init(settings, params);

        const generalGroup = new Adw.PreferencesGroup();
        this.add(generalGroup);

        const xLocationRow = this.createSpinRow(_('Location X'), 'Location_X', 0, 10000);
        generalGroup.add(xLocationRow);

        const yLocationRow = this.createSpinRow(_('Location Y'), 'Location_Y', 0, 10000);
        generalGroup.add(yLocationRow);

        const boxSpacingRow = this.createSpinRow(_('Widget Spacing'), 'Box_Spacing', 0, 500);
        generalGroup.add(boxSpacingRow);

        const boxPaddingRow = this.createSpinRow(_('Widget Padding'), 'Box_Padding', 0, 500);
        generalGroup.add(boxPaddingRow);

        const verticalLayoutSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this.getClockElementData('Box_VerticalLayout'),
        });
        const verticalLayoutRow = new Adw.ActionRow({
            title: _('Vertical Layout'),
            activatable_widget: verticalLayoutSwitch,
        });
        verticalLayoutSwitch.connect('notify::active', widget => {
            this.setClockElementData('Box_VerticalLayout', widget.get_active());
        });
        verticalLayoutRow.add_suffix(verticalLayoutSwitch);
        generalGroup.add(verticalLayoutRow);

        const borderEnabled = this.getClockElementData('Box_BorderEnabled', 'bool');

        const borderOptionsRow = new Adw.ExpanderRow({
            title: _('Enable Border'),
            show_enable_switch: true,
            enable_expansion: borderEnabled,
        });
        generalGroup.add(borderOptionsRow);
        borderOptionsRow.connect('notify::enable-expansion', widget => {
            this.setClockElementData('Box_BorderEnabled', widget.enable_expansion);
        });

        const borderWidthRow = this.createSpinRow(_('Border Width'), 'Box_BorderWidth', 0, 15);
        borderOptionsRow.add_row(borderWidthRow);
        const borderColorRow = this.createColorRow(_('Border Color'), 'Box_BorderColor');
        borderOptionsRow.add_row(borderColorRow);

        const backgroundEnabled = this.getClockElementData('Box_BackgroundEnabled', 'bool');

        const widgetBackgroundRow = new Adw.ExpanderRow({
            title: _('Enable Background'),
            show_enable_switch: true,
            enable_expansion: backgroundEnabled,
        });
        generalGroup.add(widgetBackgroundRow);

        widgetBackgroundRow.connect('notify::enable-expansion', widget => {
            this.setClockElementData('Box_BackgroundEnabled', widget.enable_expansion);
        });

        const widgetBackgroundColorRow = this.createColorRow(_('Background Color'), 'Box_BackgroundColor');
        widgetBackgroundRow.add_row(widgetBackgroundColorRow);
        const borderRadiusRow = this.createSpinRow(_('Background Radius'), 'Box_BorderRadius', 0, 999);
        widgetBackgroundRow.add_row(borderRadiusRow);
    }
});
