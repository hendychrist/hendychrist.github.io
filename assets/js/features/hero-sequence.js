const FRAME_COUNT = 306;
const LAST_FRAME = FRAME_COUNT - 1;
const DESKTOP_FRAME_ROOT = 'assets/parallax-1080-30fps-frame/webp';
const MOBILE_FRAME_ROOT = 'assets/parallax-1080-30fps-frame/webp-mobile';
const DESKTOP_SOURCE = {
	name: '1080p-30fps',
	root: DESKTOP_FRAME_ROOT
};
const MOBILE_SOURCE = {
	name: '540p-30fps',
	root: MOBILE_FRAME_ROOT
};

// Decoded 1080p frames are roughly 8 MB each. Keep this deliberately small so
// scrolling the sequence does not create hundreds of megabytes of live bitmap
// data. The browser's HTTP cache can still make reverse scrolling inexpensive.
const MAX_CACHED_FRAMES = 10;
const MAX_CONCURRENT_LOADS = 4;
const MAX_PREFETCH_LOADS = MAX_CONCURRENT_LOADS - 1;
const LOOK_AHEAD = 12;
const LOOK_BEHIND = 4;
const MAX_FALLBACK_DISTANCE = 12;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [250, 750, 1500];
const LOAD_TIMEOUT = 10000;
const MAX_CANVAS_PIXEL_RATIO = 1.25;
const EXIT_FADE_START = 2 / 3;

function frameUrl(root, index) {
	return `${root}/frame${String(index).padStart(3, '0')}.webp`;
}

function clampFrame(index) {
	return Math.min(LAST_FRAME, Math.max(0, index));
}

function drawableWidth(drawable) {
	return drawable?.naturalWidth || drawable?.width || 0;
}

function drawableHeight(drawable) {
	return drawable?.naturalHeight || drawable?.height || 0;
}

function releaseDrawable(drawable) {
	if (typeof drawable?.close === 'function')
		drawable.close();
}

function selectFrameSource() {
	const connection = navigator.connection
		|| navigator.mozConnection
		|| navigator.webkitConnection;
	const effectiveType = connection?.effectiveType || '';
	const deviceMemory = Number(navigator.deviceMemory);
	const useMobileSource = window.matchMedia?.('(max-width: 980px)').matches
		|| connection?.saveData === true
		|| effectiveType === 'slow-2g'
		|| effectiveType === '2g'
		|| effectiveType === '3g'
		|| (Number.isFinite(deviceMemory) && deviceMemory <= 4);

	return useMobileSource ? MOBILE_SOURCE : DESKTOP_SOURCE;
}

/**
 * Initializes the scroll-driven home-page frame sequence.
 *
 * @returns {boolean} Whether the animated sequence was enabled.
 */
export function initHeroSequence({ gsap, ScrollTrigger }) {
	const hero = document.querySelector('#intro.sequence-hero');
	const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

	if (!hero || !gsap || !ScrollTrigger || reduceMotion)
		return false;

	const frameSource = selectFrameSource();

	const stage = hero.querySelector('.sequence-hero__stage');
	const canvas = hero.querySelector('.sequence-hero__canvas');
	const content = hero.querySelector('.sequence-hero__content');
	const exitVeil = hero.querySelector('.sequence-hero__exit');
	const panels = content?.querySelectorAll('[data-hero-panel]');
	const introPanel = content?.querySelector('[data-hero-panel="intro"]');
	const capabilitiesPanel = content?.querySelector('[data-hero-panel="capabilities"]');
	const disciplinesPanel = content?.querySelector('[data-hero-panel="disciplines"]');
	const context = canvas?.getContext('2d', {
		alpha: false,
		desynchronized: true
	});

	if (
		!stage
		|| !canvas
		|| !context
		|| !content
		|| !panels
		|| panels.length !== 3
		|| !introPanel
		|| !capabilitiesPanel
		|| !disciplinesPanel
	)
		return false;

	const cache = new Map();
	const pending = new Map();
	const failed = new Set();
	const retryAttempts = new Map();
	const retryTimers = new Map();
	const retryReady = new Set();
	let queue = [];
	let queued = new Set();
	let activeLoads = 0;
	let requestedFrame = 0;
	let renderedFrame = -1;
	let scrollDirection = 1;
	let renderFrameRequest = 0;
	let resizeFrameRequest = 0;
	let redrawRequired = true;

	gsap.registerPlugin(ScrollTrigger);
	document.documentElement.classList.add('hero-sequence-active');
	hero.dataset.sequenceTier = frameSource.name;
	gsap.set(panels, {
		autoAlpha: 0,
		y: 28
	});
	gsap.set(introPanel, {
		autoAlpha: 1,
		y: 0
	});

	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';

	function nearestCachedFrame(target) {
		if (cache.has(target))
			return target;

		let nearest = -1;
		let nearestDistance = Infinity;

		for (const index of cache.keys()) {
			const distance = Math.abs(index - target);
			const isStableTie = distance === nearestDistance && index === renderedFrame;
			const isDirectionalTie = distance === nearestDistance
				&& scrollDirection > 0
				&& index < target;
			const isReverseTie = distance === nearestDistance
				&& scrollDirection < 0
				&& index > target;

			if (distance < nearestDistance || isStableTie || isDirectionalTie || isReverseTie) {
				nearest = index;
				nearestDistance = distance;
			}
		}

		return nearest;
	}

	function evictDistantFrames() {
		while (cache.size > MAX_CACHED_FRAMES) {
			let evictionCandidate = -1;
			let greatestDistance = -1;

			for (const index of cache.keys()) {
				if (index === renderedFrame)
					continue;

				const distance = Math.abs(index - requestedFrame);
				if (distance > greatestDistance) {
					evictionCandidate = index;
					greatestDistance = distance;
				}
			}

			if (evictionCandidate < 0)
				break;

			const drawable = cache.get(evictionCandidate);
			cache.delete(evictionCandidate);
			releaseDrawable(drawable);
		}
	}

	function drawRequestedFrame() {
		renderFrameRequest = 0;
		let index = nearestCachedFrame(requestedFrame);

		if (
			index >= 0
			&& renderedFrame >= 0
			&& index !== requestedFrame
			&& Math.abs(index - requestedFrame) > MAX_FALLBACK_DISTANCE
		)
			index = renderedFrame;

		if (index < 0 || (index === renderedFrame && !redrawRequired))
			return;

		const drawable = cache.get(index);
		const sourceWidth = drawableWidth(drawable);
		const sourceHeight = drawableHeight(drawable);
		if (!sourceWidth || !sourceHeight)
			return;

		const scale = Math.max(
			canvas.width / sourceWidth,
			canvas.height / sourceHeight
		);
		const width = sourceWidth * scale;
		const height = sourceHeight * scale;

		context.drawImage(
			drawable,
			(canvas.width - width) / 2,
			(canvas.height - height) / 2,
			width,
			height
		);
		canvas.classList.add('is-ready');
		renderedFrame = index;
		redrawRequired = false;
		evictDistantFrames();
	}

	function scheduleRender() {
		if (renderFrameRequest)
			return;

		renderFrameRequest = window.requestAnimationFrame(drawRequestedFrame);
	}

	function resizeCanvas() {
		const width = Math.max(stage.clientWidth, 1);
		const height = Math.max(stage.clientHeight, 1);
		const desiredPixelRatio = Math.max(window.devicePixelRatio || 1, 1);
		const pixelRatio = Math.max(0.25, Math.min(
			desiredPixelRatio,
			MAX_CANVAS_PIXEL_RATIO
		));
		const canvasWidth = Math.max(1, Math.round(width * pixelRatio));
		const canvasHeight = Math.max(1, Math.round(height * pixelRatio));

		if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
			canvas.width = canvasWidth;
			canvas.height = canvasHeight;
			context.imageSmoothingEnabled = true;
			context.imageSmoothingQuality = 'high';
			redrawRequired = true;
		}

		scheduleRender();
	}

	function clearLoadTimeout(record) {
		if (record.timeoutId) {
			window.clearTimeout(record.timeoutId);
			record.timeoutId = 0;
		}
	}

	function scheduleRetry(index) {
		const attempt = (retryAttempts.get(index) || 0) + 1;
		retryAttempts.set(index, attempt);

		if (attempt > MAX_RETRIES) {
			retryReady.delete(index);
			failed.add(index);
			return;
		}

		if (retryTimers.has(index))
			return;

		const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS.at(-1);
		const timer = window.setTimeout(() => {
			retryTimers.delete(index);
			failed.delete(index);
			retryReady.add(index);

			if (cache.has(index) || pending.has(index) || queued.has(index))
				return;

			queued.add(index);
			queue.unshift(index);
			pumpQueue();
		}, delay);
		retryTimers.set(index, timer);
	}

	function completeLoad(index, record, drawable, outcome) {
		if (pending.get(index) !== record) {
			releaseDrawable(drawable);
			return;
		}

		clearLoadTimeout(record);
		pending.delete(index);
		activeLoads -= 1;

		if (outcome === 'success') {
			retryAttempts.delete(index);
			retryReady.delete(index);
			failed.delete(index);
			cache.set(index, drawable);
			evictDistantFrames();
			scheduleRender();
		} else if (outcome === 'failed') {
			scheduleRetry(index);
			scheduleRender();
		}

		pumpQueue();
	}

	function loadWithImage(index, record) {
		if (pending.get(index) !== record)
			return;

		const image = new Image();
		record.image = image;
		record.controller = null;
		record.timedOut = false;
		image.decoding = 'async';
		image.fetchPriority = index === requestedFrame ? 'high' : 'auto';
		record.timeoutId = window.setTimeout(() => {
			record.timedOut = true;
			image.onload = null;
			image.onerror = null;
			image.src = '';
			completeLoad(index, record, null, 'failed');
		}, LOAD_TIMEOUT);

		image.onload = () => {
			const finish = () => completeLoad(index, record, image, 'success');
			if (typeof image.decode !== 'function') {
				finish();
				return;
			}

			image.decode().catch(() => undefined).then(finish);
		};
		image.onerror = () => completeLoad(index, record, null, 'failed');
		image.src = frameUrl(frameSource.root, index);
	}

	function startLoad(index) {
		activeLoads += 1;
		const record = {
			controller: null,
			image: null,
			timeoutId: 0,
			timedOut: false
		};
		pending.set(index, record);

		const canLoadBitmap = typeof window.fetch === 'function'
			&& typeof window.createImageBitmap === 'function'
			&& typeof window.AbortController === 'function';

		if (!canLoadBitmap) {
			loadWithImage(index, record);
			return;
		}

		record.controller = new AbortController();
		record.timeoutId = window.setTimeout(() => {
			record.timedOut = true;
			record.controller?.abort();
		}, LOAD_TIMEOUT);
		fetch(frameUrl(frameSource.root, index), {
			cache: 'force-cache',
			signal: record.controller.signal
		})
			.then((response) => {
				if (!response.ok) {
					const error = new Error(`Frame request failed with ${response.status}`);
					error.isFrameResponseError = true;
					throw error;
				}

				return response.blob();
			})
			.then((blob) => window.createImageBitmap(blob).catch((error) => {
				error.isBitmapError = true;
				throw error;
			}))
			.then((bitmap) => completeLoad(index, record, bitmap, 'success'))
			.catch((error) => {
				if (pending.get(index) !== record)
					return;

				if (error?.name === 'AbortError') {
					completeLoad(index, record, null, record.timedOut ? 'failed' : 'aborted');
					return;
				}

				if (error?.isBitmapError) {
					// Safari versions with partial ImageBitmap support can reject valid
					// WebP blobs. Fall back to the regular image decoder in that case.
					clearLoadTimeout(record);
					loadWithImage(index, record);
					return;
				}

				completeLoad(index, record, null, 'failed');
			});
	}

	function pumpQueue() {
		while (queue.length > 0) {
			const index = queue[0];
			const isTarget = index === requestedFrame;
			const loadLimit = isTarget ? MAX_CONCURRENT_LOADS : MAX_PREFETCH_LOADS;

			if (activeLoads >= loadLimit)
				break;

			queue.shift();
			queued.delete(index);

			if (cache.has(index) || pending.has(index) || failed.has(index))
				continue;

			startLoad(index);
		}
	}

	function prioritize(target) {
		const orderedFrames = [target];

		for (let distance = 1; distance <= LOOK_AHEAD; distance += 1)
			orderedFrames.push(target + (scrollDirection * distance));

		for (let distance = 1; distance <= LOOK_BEHIND; distance += 1)
			orderedFrames.push(target - (scrollDirection * distance));

		queue = [];
		queued = new Set();
		for (const index of orderedFrames) {
			if (index < 0 || index > LAST_FRAME)
				continue;

			if (queued.has(index) || cache.has(index) || pending.has(index) || failed.has(index))
				continue;

			queued.add(index);
			queue.push(index);
		}

		for (const index of retryReady) {
			if (cache.has(index) || pending.has(index) || failed.has(index) || queued.has(index))
				continue;

			queued.add(index);
			queue.push(index);
		}

		pumpQueue();
	}

	function requestFrame(index) {
		const nextFrame = clampFrame(Math.round(index));
		if (nextFrame !== requestedFrame) {
			scrollDirection = nextFrame > requestedFrame ? 1 : -1;
			requestedFrame = nextFrame;
		}

		prioritize(requestedFrame);
		scheduleRender();
	}

	resizeCanvas();
	prioritize(0);

	const playhead = { frame: 0 };
	const sequenceTimeline = gsap.timeline({
		scrollTrigger: {
			trigger: hero,
			start: 'top top',
			end: '+=300%',
			pin: stage,
			scrub: 0.15,
			invalidateOnRefresh: true,
			onUpdate(self) {
				if (!exitVeil)
					return;

				const exitProgress = Math.max(0, Math.min(
					1,
					(self.progress - EXIT_FADE_START) / (1 - EXIT_FADE_START)
				));
				exitVeil.style.opacity = String(exitProgress);
			}
		}
	});

	sequenceTimeline
		.to(playhead, {
			duration: 1,
			ease: 'none',
			frame: LAST_FRAME,
			onUpdate() {
				requestFrame(playhead.frame);
			}
		}, 0)
		.to(introPanel, {
			autoAlpha: 0,
			duration: 0.08,
			ease: 'none',
			y: -24
		}, 0.20)
		.fromTo(capabilitiesPanel, {
			autoAlpha: 0,
			y: 28
		}, {
			autoAlpha: 1,
			duration: 0.08,
			ease: 'none',
			y: 0
		}, 0.26)
		.to(capabilitiesPanel, {
			autoAlpha: 0,
			duration: 0.09,
			ease: 'none',
			y: -24
		}, 0.54)
		.fromTo(disciplinesPanel, {
			autoAlpha: 0,
			y: 28
		}, {
			autoAlpha: 1,
			duration: 0.08,
			ease: 'none',
			y: 0
		}, 0.60)
		.to(disciplinesPanel, {
			autoAlpha: 0,
			duration: 0.10,
			ease: 'none',
			y: -20
		}, 0.90);

	function handleResize() {
		window.cancelAnimationFrame(resizeFrameRequest);
		resizeFrameRequest = window.requestAnimationFrame(() => {
			resizeCanvas();
			ScrollTrigger.refresh();
		});
	}

	window.addEventListener('resize', handleResize, { passive: true });
	window.addEventListener('orientationchange', handleResize, { passive: true });
	return true;
}
