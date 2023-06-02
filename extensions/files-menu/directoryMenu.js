/*
 * Copyright 2014 - 2019 Axel von Bertoldi
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 2 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program; if not, write to:
 * The Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor
 * Boston, MA 02110-1301, USA.
 */

const St = imports.gi.St;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;
const Gettext = imports.gettext.domain("files-menu");
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Self = ExtensionUtils.getCurrentExtension();
const mi = Self.imports.menuItems;
const MenuItem = Self.imports.menuItems.MenuItem;

const ScrollableMenu = class ScrollableMenu extends PopupMenu.PopupMenuSection {
    constructor() {
        super();
        let scrollView = new St.ScrollView({
            y_align: St.Align.START,
            overlay_scrollbars: true,
            style_class: 'vfade'
        });
        this.innerMenu = new PopupMenu.PopupMenuSection();
        scrollView.add_actor(this.innerMenu.actor);
        this.actor.add_actor(scrollView);
    }

    addMenuItem(item) {
        this.innerMenu.addMenuItem(item);
    }

    removeAll() {
        this.innerMenu.removeAll();
    }
};

var DirectoryMenu = GObject.registerClass(
    class DirectoryMenu extends PanelMenu.Button {
        _init() {
            super._init(0.0, "FilesMenu");
            this.label = new St.Label({ text: _(homeText) + arrowText,
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER });
            this.add_actor(this.label);
            this.home_dir = Gio.file_new_for_path(GLib.get_home_dir());
            this.current_dir = this.home_dir;

            this.createLayout();

            this.connect('button-press-event', this.loadDirectory.bind(this));
            // not sure why this is necessary, but it is...
            this.loadDirectory();
        }

        createLayout() {
            this.header = new PopupMenu.PopupMenuSection();
            this.menu.addMenuItem(this.header);
            this.filesList = new ScrollableMenu();
            this.menu.addMenuItem(this.filesList);
        }

        changeDirectory(file_info) {
            this.current_dir = file_info;
            this.setLabel();
            this.loadDirectory();
        }

        loadDirectory() {
            this.clearMenu();
            this.addHeader();
            this.addDirContents();
        }

        setLabel() {
            if (!this.currentDirIsHome()) {
                this.label.set_text(this.current_dir.get_basename() + arrowText);
            } else {
                this.label.set_text(_(homeText) + arrowText);
            }
        }

        currentDirIsHome() {
            return this.current_dir.get_path() == this.home_dir.get_path();
        }

        clearMenu() {
            this.header.removeAll();
            this.filesList.removeAll();
        }

        addHeader() {
            if (!this.currentDirIsHome()) {
                this.header.addMenuItem(this.makeHomeItem());
            }
            this.header.addMenuItem(this.makeCurrentDirItem());
            if (this.current_dir.has_parent(null)) {
                this.header.addMenuItem(this.makeUpItem());
            }
            this.header.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        addDirContents(file) {
            this.processDirectory(this.current_dir.enumerate_children('*', 0, null));
        }

        processDirectory(children) {
            let files = [];
            let dirs = [];
            let file_info = null;
            while ((file_info = children.next_file(null)) !== null) {
                if (file_info.get_is_hidden()) { continue; }
                if (isDirectory(file_info)) { dirs.push(file_info); }
                else { files.push(file_info); }
            }
            children.close(null);

            dirs.sort(fileComparator);
            dirs.forEach((fi) => {
                this.filesList.addMenuItem(this.createItem(fi));
            });
            this.filesList.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            files.sort(fileComparator);
            files.forEach((fi) => {
                this.filesList.addMenuItem(this.createItem(fi));
            });
        }

        createItem(file_info) {
            return new MenuItem(file_info.get_display_name(), null,
                file_info.get_symbolic_icon(),
                this.makeCallback(file_info, ClickBehaviour.DEFAULT));
        }

        makeCallback(file_info, onClick) {
            if (onClick === ClickBehaviour.DEFAULT) {
                onClick = isDirectory(file_info) ? ClickBehaviour.CD : ClickBehaviour.OPEN;
            }
            if (onClick === ClickBehaviour.CD) {
                return () => {
                    this.changeDirectory(this.current_dir.get_child(file_info.get_name()));
                }
            } else if (onClick === ClickBehaviour.OPEN) {
                return () => {
                    this.openItem(this.current_dir.get_child(file_info.get_name()));
                }
            }
        }

        makeHomeItem() {
            return new MenuItem(_(homeText), "user-home-symbolic", null,
                () => {
                    this.changeDirectory(this.home_dir);
                });
        }

        makeCurrentDirItem(file_info) {
            return new MenuItem(_(openText) + " " + this.current_dir.get_basename(),
                "document-open-symbolic", null,
                () => {
                    this.openItem(this.current_dir);
                });
        }

        makeUpItem() {
            return new MenuItem("..", "go-up-symbolic", null,
                () => {
                    this.changeDirectory(this.current_dir.get_parent());
                });
        }

        openItem(file) {
            Gio.app_info_launch_default_for_uri(file.get_uri(), null);
            this.menu.close();
        }

        destroy() {
            super.destroy();
        }
    });


var arrowText = " \u25BE";
var homeText = "Home";
var openText = "Open";

function isDirectory(file) {
    return Gio.FileType.DIRECTORY == file.get_file_type();
}

function fileComparator(l, r) {
    return l.get_display_name().localeCompare(r.get_display_name());
}

var ClickBehaviour = Object.freeze({OPEN: 0, CD: 1, DEFAULT: 2});
