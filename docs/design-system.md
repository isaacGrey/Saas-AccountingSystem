# Interface and theme system

Working name: Tala Accounting, original interface. Neutral canvas, navy navigation, compact but readable accounting tables, blue primary actions, warm workspace avatar. No copied AccountingSuite assets. Semantic labels accompany colour.

CSS tokens: background, surface, text, muted, border, primary, soft, sidebar, sidebar text and shadow. Five presets: Ocean Blue, Emerald, Indigo, Graphite, Warm Neutral. Mode: light, dark, system (reacts to OS changes). Company theme JSON is strict enum validated, saved server-side and audited; preview is local until Save. Discard restores saved values. Print rules remove navigation and controls.

Accessibility foundation: labelled fields, visible focus rings, semantic headings/tables, status/error regions, dialog role, initial dialog focus, Tab trapping, Escape dismissal, responsive navigation and reduced table overflow through scroll regions. Browser tests exercise desktop and 390px width. This is not a WCAG certification. Screen reader review, focus restoration, unsaved-change confirmation and full keyboard audit remain necessary.

Planned precedence: platform defaults < tenant defaults < company branding < personal accessibility/appearance override. Only company settings exist now. Future custom token editor must validate HEX, contrast and stable semantic colours; logo/report branding must preserve mandatory legal fields. JSON import/export and draft/publish versioning need schema/version validation. Current tables/search operate on latest 100 documents; all-time report totals are server aggregates.
