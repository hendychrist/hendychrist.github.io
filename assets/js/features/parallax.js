/**
 * Adds and initializes the background parallax behavior.
 *
 * @param {JQueryStatic} $ jQuery global provided by the page.
 * @param {object} browser Browser detection helper provided by browser.min.js.
 * @param {Function} breakpoints Responsive breakpoint helper.
 */
export function initParallax($, browser, breakpoints) {
	const $window = $(window);

	/**
	 * Applies parallax scrolling to an element's background image.
	 *
	 * @param {number} intensity Parallax movement multiplier.
	 * @return {jQuery} jQuery object.
	 */
	$.fn._parallax = function(intensity) {
		const $this = $(this);

		if (this.length === 0 || intensity === 0)
			return $this;

		if (this.length > 1) {
			for (let i = 0; i < this.length; i++)
				$(this[i])._parallax(intensity);

			return $this;
		}

		if (!intensity)
			intensity = 0.25;

		$this.each(function() {
			const $t = $(this);
			const $bg = $('<div class="bg"></div>').appendTo($t);

			const on = function() {
				$bg
					.removeClass('fixed')
					.css('transform', 'matrix(1,0,0,1,0,0)');

				$window.on('scroll._parallax', function() {
					const pos = parseInt($window.scrollTop()) - parseInt($t.position().top);

					$bg.css('transform', 'matrix(1,0,0,1,0,' + (pos * intensity) + ')');
				});
			};

			const off = function() {
				$bg
					.addClass('fixed')
					.css('transform', 'none');

				$window.off('scroll._parallax');
			};

			// Disable parallax on IE, Edge, Retina/HiDPI, and mobile devices.
			if (
				browser.name === 'ie'
				|| browser.name === 'edge'
				|| window.devicePixelRatio > 1
				|| browser.mobile
			) {
				off();
			} else {
				breakpoints.on('>large', on);
				breakpoints.on('<=large', off);
			}
		});

		$window
			.off('load._parallax resize._parallax')
			.on('load._parallax resize._parallax', function() {
				$window.trigger('scroll');
			});

		return $(this);
	};

	// Background.
	$('#wrapper')._parallax(0.925);
}
