const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {Adw, GObject, Gtk} = imports.gi;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const Settings = Me.imports.settings;
const {SubPage} = Settings.SubPage;

var DigitalClockSubPage = GObject.registerClass(
class AzClockDigitalClockSubPage extends SubPage {
    _init(settings, params) {
        super._init(settings, params);

        const timeZoneGroup = new Adw.PreferencesGroup();
        this.add(timeZoneGroup);

        const timeZoneRow = this.createTimeZoneRow();
        timeZoneGroup.add(timeZoneRow);

        const dateFormatGroup = new Adw.PreferencesGroup();
        this.add(dateFormatGroup);

        const dateFormatExpanderRow = new Adw.ExpanderRow({
            title: _('Date/Time Format'),
            expanded: true,
            enable_expansion: true,
        });

        const dateFormatEntry = new Gtk.Entry({
            valign: Gtk.Align.FILL,
            vexpand: true,
            halign: Gtk.Align.FILL,
            hexpand: true,
            text: this.getClockElementData('Text_DateFormat'),
        });
        dateFormatEntry.connect('changed', () => {
            this.setClockElementData('Text_DateFormat', dateFormatEntry.get_text());
        });
        const dateFormatRow = new Adw.ActionRow({
            activatable: false,
            selectable: false,
        });

        const linksBox = new Gtk.Box({
            css_classes: ['linked'],
        });

        const linkButton = new Gtk.LinkButton({
            label: _('Format Guide'),
            uri: 'https://docs.python.org/3/library/datetime.html#strftime-and-strptime-format-codes',
            css_classes: ['caption'],
            valign: Gtk.Align.CENTER,
        });
        linksBox.append(linkButton);

        const linkButton2 = new Gtk.LinkButton({
            label: _('Markup Guide'),
            uri: 'https://docs.gtk.org/Pango/pango_markup.html',
            css_classes: ['caption'],
            valign: Gtk.Align.CENTER,
        });
        linksBox.append(linkButton2);

        dateFormatRow.set_child(dateFormatEntry);

        dateFormatExpanderRow.add_action(linksBox);
        dateFormatExpanderRow.add_row(dateFormatRow);

        dateFormatGroup.add(dateFormatExpanderRow);

        const generalGroup = new Adw.PreferencesGroup();
        this.add(generalGroup);

        const textAlignmentXRow = this.createComboRow(_('Alignment X'), 'Text_AlignmentX');
        generalGroup.add(textAlignmentXRow);

        const textAlignmentYRow = this.createComboRow(_('Alignment Y'), 'Text_AlignmentY');
        generalGroup.add(textAlignmentYRow);

        const lineAlignmentRow = this.createComboRow(_('Line Alignment'), 'Text_LineAlignment');
        generalGroup.add(lineAlignmentRow);

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

        const paddingExpanderRow = new Adw.ExpanderRow({
            title: _('Padding'),
        });
        generalGroup.add(paddingExpanderRow);

        const paddingTopRow = this.createSpinRow(_('Top'), 'Element_Padding_Top', 0, 200);
        paddingExpanderRow.add_row(paddingTopRow);
        const paddingRightRow = this.createSpinRow(_('Right'), 'Element_Padding_Right', 0, 200);
        paddingExpanderRow.add_row(paddingRightRow);
        const paddingBottomRow = this.createSpinRow(_('Bottom'), 'Element_Padding_Bottom', 0, 200);
        paddingExpanderRow.add_row(paddingBottomRow);
        const paddingLeftRow = this.createSpinRow(_('Left'), 'Element_Padding_Left', 0, 200);
        paddingExpanderRow.add_row(paddingLeftRow);

        const textOptionsGroup = new Adw.PreferencesGroup({
            title: _('Text Style'),
        });
        this.add(textOptionsGroup);

        const fontEnabled = this.getClockElementData('Text_CustomFontEnabled', 'bool');
        const fontFamily = this.getClockElementData('Text_CustomFontFamily');
        const fontButton = new Gtk.FontButton({
            valign: Gtk.Align.CENTER,
            use_size: false,
            use_font: true,
            level: Gtk.FontChooserLevel.FAMILY, // | Gtk.FontChooserLevel.STYLE,
            font: fontFamily,
        });
        const fontRow = new Adw.ActionRow({
            title: _('Font'),
        });
        fontButton.connect('notify::font', widget => {
            this.setClockElementData('Text_CustomFontFamily', widget.font);
        });
        fontRow.add_suffix(fontButton);
        const fontExpanderRow = new Adw.ExpanderRow({
            title: _('Override Font Family'),
            show_enable_switch: true,
            expanded: fontEnabled,
            enable_expansion: fontEnabled,
        });
        fontExpanderRow.connect('notify::enable-expansion', widget => {
            this.setClockElementData('Text_CustomFontEnabled', widget.enable_expansion);
        });
        fontExpanderRow.add_row(fontRow);
        textOptionsGroup.add(fontExpanderRow);

        const timeFontSizeRow = this.createSpinRow(_('Font Size'), 'Text_Size', 8, 200);
        textOptionsGroup.add(timeFontSizeRow);

        const textColorRow = this.createColorRow(_('Text Color'), 'Text_Color');
        textOptionsGroup.add(textColorRow);

        const shadowExpanderRow = this.createShadowExpanderRow(_('Text Shadow'), 'Text_Shadow');
        textOptionsGroup.add(shadowExpanderRow);

        const borderEnabled = this.getClockElementData('Text_BorderEnabled', 'bool');
        const borderOptionsRow = new Adw.ExpanderRow({
            title: _('Enable Border'),
            show_enable_switch: true,
            enable_expansion: borderEnabled,
        });
        textOptionsGroup.add(borderOptionsRow);
        borderOptionsRow.connect('notify::enable-expansion', widget => {
            this.setClockElementData('Text_BorderEnabled', widget.enable_expansion);
        });

        const borderWidthRow = this.createSpinRow(_('Border Width'), 'Text_BorderWidth', 0, 15);
        borderOptionsRow.add_row(borderWidthRow);
        const borderColorRow = this.createColorRow(_('Border Color'), 'Text_BorderColor');
        borderOptionsRow.add_row(borderColorRow);

        const backgroundEnabled = this.getClockElementData('Text_BackgroundEnabled', 'bool');
        const widgetBackgroundRow = new Adw.ExpanderRow({
            title: _('Enable Background'),
            show_enable_switch: true,
            enable_expansion: backgroundEnabled,
        });
        textOptionsGroup.add(widgetBackgroundRow);

        widgetBackgroundRow.connect('notify::enable-expansion', widget => {
            this.setClockElementData('Text_BackgroundEnabled', widget.enable_expansion);
        });

        const widgetBackgroundColorRow = this.createColorRow(_('Background Color'), 'Text_BackgroundColor');
        widgetBackgroundRow.add_row(widgetBackgroundColorRow);
        const borderRadiusRow = this.createSpinRow(_('Background Radius'), 'Text_BorderRadius', 0, 999);
        widgetBackgroundRow.add_row(borderRadiusRow);
    }

    createComboRow(title, setting) {
        const value = this.getClockElementData(setting);
        const stringList = new Gtk.StringList();
        stringList.append(_('Start'));
        stringList.append(_('Center'));
        stringList.append(_('End'));

        let selectedValue = 0;

        if (value === 'Start')
            selectedValue = 0;
        else if (value === 'Center')
            selectedValue = 1;
        else if (value === 'End')
            selectedValue = 2;

        const comboRow = new Adw.ComboRow({
            title: _(title),
            model: stringList,
            selected: selectedValue,
        });
        comboRow.connect('notify::selected', widget => {
            this.setClockElementData(setting, widget.selected_item.string);
        });
        return comboRow;
    }
});
