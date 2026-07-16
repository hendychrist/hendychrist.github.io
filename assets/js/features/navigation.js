/**
 * Initializes the responsive navigation panel.
 *
 * @param {JQueryStatic} $ jQuery global provided by the page.
 * @param {object} browser Browser detection helper provided by browser.min.js.
 * @param {Function} breakpoints Responsive breakpoint helper.
 */
export function initNavigation($, browser, breakpoints) {
	const $body = $('body');
	const $wrapper = $('#wrapper');
	const $header = $('#header');
	const $nav = $('#nav');

	// Toggle.
	const $navPanelToggle = $(
		'<a href="#navPanel" id="navPanelToggle">Menu</a>'
	).appendTo($wrapper);

	// Change toggle styling once we've scrolled past the header.
	$header.scrollex({
		bottom: '5vh',
		enter: function() {
			$navPanelToggle.removeClass('alt');
		},
		leave: function() {
			$navPanelToggle.addClass('alt');
		}
	});

	// Panel.
	const $navPanel = $(
		'<div id="navPanel">' +
			'<nav>' +
			'</nav>' +
			'<a href="#navPanel" class="close"></a>' +
		'</div>'
	)
		.appendTo($body)
		.panel({
			delay: 500,
			hideOnClick: true,
			hideOnSwipe: true,
			resetScroll: true,
			resetForms: true,
			side: 'right',
			target: $body,
			visibleClass: 'is-navPanel-visible'
		});

	const $navPanelInner = $navPanel.children('nav');
	const $navContent = $nav.children();

	// Move nav content on breakpoint change.
	breakpoints.on('>medium', function() {
		$navContent.appendTo($nav);

		$nav.find('.icons, .icon')
			.removeClass('alt');
	});

	breakpoints.on('<=medium', function() {
		$navContent.appendTo($navPanelInner);

		$navPanelInner.find('.icons, .icon')
			.addClass('alt');
	});

	// Hack: Disable transitions on Windows Phone.
	if (browser.os === 'wp' && browser.osVersion < 10)
		$navPanel.css('transition', 'none');
}
