/**
 * Adds gentle, one-time reveals to the home-page project showcase.
 *
 * Content remains visible by default. Initial hidden states are only applied
 * after GSAP and ScrollTrigger are confirmed to be available.
 *
 * @returns {boolean} Whether showcase motion was enabled.
 */
export function initProjectShowcase({ gsap, ScrollTrigger }) {
	const section = document.querySelector('#projects.project-showcase');
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (
		!section
		|| !gsap
		|| !ScrollTrigger
		|| typeof gsap.fromTo !== 'function'
		|| reduceMotion
	)
		return false;

	const header = section.querySelector('.project-showcase__header');
	const intro = section.querySelector('.project-showcase__intro');
	const cards = section.querySelectorAll('[data-project-card]');

	gsap.registerPlugin(ScrollTrigger);

	if (header) {
		gsap.fromTo(header, {
			autoAlpha: 0,
			y: -16
		}, {
			autoAlpha: 1,
			y: 0,
			duration: 0.75,
			ease: 'power3.out',
			clearProps: 'opacity,visibility,transform',
			scrollTrigger: {
				trigger: section,
				start: 'top 92%',
				once: true
			}
		});
	}

	if (intro) {
		gsap.fromTo(intro, {
			autoAlpha: 0,
			y: 32
		}, {
			autoAlpha: 1,
			y: 0,
			duration: 0.85,
			ease: 'power3.out',
			clearProps: 'opacity,visibility,transform',
			scrollTrigger: {
				trigger: intro,
				start: 'top 88%',
				once: true
			}
		});
	}

	cards.forEach((card) => {
		gsap.fromTo(card, {
			autoAlpha: 0,
			y: 48
		}, {
			autoAlpha: 1,
			y: 0,
			duration: 0.85,
			ease: 'power3.out',
			clearProps: 'opacity,visibility,transform',
			scrollTrigger: {
				trigger: card,
				start: 'top 88%',
				once: true
			}
		});

		const media = card.querySelector('.project-card__media');

		if (media) {
			gsap.fromTo(media, {
				scale: 1.025
			}, {
				scale: 1,
				duration: 1,
				ease: 'power3.out',
				clearProps: 'transform',
				scrollTrigger: {
					trigger: card,
					start: 'top 88%',
					once: true
				}
			});
		}
	});

	const contribCards = document.querySelectorAll('#contributions [data-project-card]');

	contribCards.forEach((card) => {
		gsap.fromTo(card, {
			autoAlpha: 0,
			y: 48
		}, {
			autoAlpha: 1,
			y: 0,
			duration: 0.85,
			ease: 'power3.out',
			clearProps: 'opacity,visibility,transform',
			scrollTrigger: {
				trigger: card,
				start: 'top 88%',
				once: true
			}
		});

		const visual = card.querySelector('.contrib-card__visual');

		if (visual) {
			gsap.fromTo(visual, {
				scale: 1.025
			}, {
				scale: 1,
				duration: 1,
				ease: 'power3.out',
				clearProps: 'transform',
				scrollTrigger: {
					trigger: card,
					start: 'top 88%',
					once: true
				}
			});
		}
	});

	return true;
}
