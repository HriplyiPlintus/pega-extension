#Implemented features

-   Tab refresh from icon
    -   Application definition
    -   Branch
-   Tag icon on rule form - copies rule signature to clipboard. By default rule signature is a combination of most importand rule info attributes e.g.
    > <rule_type> <class>.<name>
-   Key icon on rule form - copies rule pzInsKey to clipboard.
-   Tab switch - allows to switch instantly between two most recent tabs. Hotkey configuration available from extension popup and separate for different os types
    known bugs: - Sometimes not switching to New rule tab (not saved rule) - Sometimes not switching from section rule
-   Close tab on middle click
-   Log icon on dev studio left corner - opens local logs menu or external logs depending on single click or double click. Configurable from extension popup
-   DB Query with parameter values in prettified format, icon on this field copies result SQL to clipboard
-   Toggle Pega rulesets in Tracer settings
-   Most useful pages pinned in Clipboard viewer - by default: pyWorkPage, pyWorkCover, newAssignPage, pyDisplayHarness, RH_1
-   Reorder tabs by drag and drop

#To be implemented:

-   make rule signature configurable from extension popup
-   prettify tabs
    -   minimize home tab
    -   avoid empty spaces in tabs headers
-   add functionality to create personal sets of rulesets to toggle
-   allow to pin pages in clipboard viewer
-   memorize width of the left panel in Clipboard viewer
-   tab card - most useful tab information on hover. allow to disable
-   hide/show settings for tracer columns
-   allow to change UI elements sizes from menu
-   change warnings view to the one from the screenshot
-   prettify pages viewer in tracer
-   highlight environment on tab icon, dev studio, tracer
-   get start and end of a rule execution in tracer
-   add new row in validate rule on enter
-   open tab in new browser window
-   split view
-   extension settings
-   allow to turn off features
-   extension icon view update on allowed tabs
-   highlight nested rows in data transform

Extension settings synced between browsers

#Known bugs:

-   Dev Studio tabs reordered in initial state after browser tab refresh - no plans to fix this
