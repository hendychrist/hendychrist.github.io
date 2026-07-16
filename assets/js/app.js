/*
	Massively by HTML5 UP
	html5up.net | @ajlkn
	Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)
*/

import { initParallax } from './features/parallax.js';
import { initNavigation } from './features/navigation.js';
import { initIntro } from './features/intro.js';
import { initHeroSequence } from './features/hero-sequence.js';
import { initProjectShowcase } from './features/project-showcase.js';
import { initPodiumSequencer } from './features/podium-sequencer.js';

const { jQuery, browser, breakpoints } = window;
const $ = jQuery;
const $window = $(window);
const $body = $('body');

// Breakpoints.
breakpoints({
	default: ['1681px', null],
	xlarge: ['1281px', '1680px'],
	large: ['981px', '1280px'],
	medium: ['737px', '980px'],
	small: ['481px', '736px'],
	xsmall: ['361px', '480px'],
	xxsmall: [null, '360px']
});

// Play initial animations on page load.
$window.on('load', function() {
	window.setTimeout(function() {
		$body.removeClass('is-preload');
	}, 100);
});

// Scrolly.
$('.scrolly').scrolly();

initParallax(jQuery, browser, breakpoints);

const nav = document.querySelector('#nav');

if (nav && !nav.hidden)
	initNavigation(jQuery, browser, breakpoints);

const heroSequenceActive = initHeroSequence({
	gsap: window.gsap,
	ScrollTrigger: window.ScrollTrigger
});

if (!heroSequenceActive && !document.querySelector('#intro.sequence-hero'))
	initIntro(jQuery, browser, breakpoints);

initProjectShowcase({
	gsap: window.gsap,
	ScrollTrigger: window.ScrollTrigger
});

initPodiumSequencer({
	gsap: window.gsap,
	ScrollTrigger: window.ScrollTrigger
});
