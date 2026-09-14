# Use measured DOM for card pagination and export

Card output is parsed into semantic blocks, measured off-screen with the same fonts and CSS used by the visible card, and converted into a reusable page plan that drives both preview and PNG export. This was chosen over character-count splitting, which cannot account for real typography, and a pure Canvas renderer, which would duplicate browser text layout and make six portable CSS-driven styles substantially harder to maintain; explicit `<!-- pagebreak -->` markers override automatic pagination and `==text==` carries semantic highlighting.
