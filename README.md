## Disclaimer

This is probably not complete.
Probably missed some renames or default values, if you find any, let me know.

## Usage

`python fix.py <filename> <flag>`

Can be used with flags `--named` and `--restore`

Automatically creates a backup of the file in the same directory with the extention `.bak`

## Examples

Update rules.conf with anonymous rules

`python fix.py ~/.config/hypr/rules.conf`

Use named rules in the style of \<type>-#, ie windowrule-1 ...

`python fix.py ~/.config/hypr/rules.conf --named`

Restore rules.conf if rules.conf.bak exists in the `~/.config/hypr/` folder

`python fix.py ~/.config/hypr/rules.conf --restore`
