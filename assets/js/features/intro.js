/**
 * Initializes the home-page intro behavior.
 *
 * @param {JQueryStatic} $ jQuery global provided by the page.
 * @param {object} browser Browser detection helper provided by browser.min.js.
 * @param {Function} breakpoints Responsive breakpoint helper.
 */
export function initIntro($, browser, breakpoints) {
	const $window = $(window);
	const $main = $('#main');
	const $intro = $('#intro');

	if ($intro.length === 0)
		return;

	// Hack: Fix flex min-height on IE.
	if (browser.name === 'ie') {
		$window.on('resize.ie-intro-fix', function() {
			const h = $intro.height();

			if (h > $window.height())
				$intro.css('height', 'auto');
			else
				$intro.css('height', h);
		}).trigger('resize.ie-intro-fix');
	}

	// Hide intro on scroll (> small).
	breakpoints.on('>small', function() {
		$main.unscrollex();

		$main.scrollex({
			mode: 'bottom',
			top: '25vh',
			bottom: '-50vh',
			enter: function() {
				$intro.addClass('hidden');
			},
			leave: function() {
				$intro.removeClass('hidden');
			}
		});
	});

	// Hide intro on scroll (<= small).
	breakpoints.on('<=small', function() {
		$main.unscrollex();

		$main.scrollex({
			mode: 'middle',
			top: '15vh',
			bottom: '-15vh',
			enter: function() {
				$intro.addClass('hidden');
			},
			leave: function() {
				$intro.removeClass('hidden');
			}
		});
	});
}
