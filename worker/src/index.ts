/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const baseHeaders = {
	'Content-Type': 'application/json',
	Origin: 'https://arcaea.lowiro.com',
	Referer: 'https://arcaea.lowiro.com/',
};

const CORSHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': '*',
	'Access-Control-Allow-Headers': '*',
};

async function login(email: string, password: string) {
	const res = await fetch('https://webapi.lowiro.com/auth/login', {
		headers: baseHeaders,
		body: JSON.stringify({ email, password }),
		method: 'POST',
	});
	return res.headers.getSetCookie();
}

function createCookieHeader(setCookies: string[]) {
	const result: string[] = [];
	for (const setCookie of setCookies) {
		const kvPairString = setCookie.slice(0, setCookie.indexOf(';'));
		result.push(kvPairString);
	}
	return result.join('; ');
}

type CharacterStat = {
	character_id: number;
	name: string;
	icon: string;
	profile_image: string;
	display_name: {
		en: string;
		ja: string;
		'zh-Hans': string;
	};
};

async function getUserData(cookieHeader: string) {
	const res = await fetch('https://webapi.lowiro.com/webapi/user/me', {
		headers: {
			...baseHeaders,
			Cookie: cookieHeader,
		},
	});
	return (await res.json()) as {
		success: boolean;
		value?: {
			name: string;
			user_code: string;
			rating: number;
			character: number;
			character_stats: CharacterStat[];
		};
	};
}

async function getRatingData(cookieHeader: string) {
	const res = await fetch('https://webapi.lowiro.com/webapi/score/rating/me', {
		headers: {
			...baseHeaders,
			Cookie: cookieHeader,
		},
	});
	const result = (await res.json()) as
		| { success: false; error_code: number }
		| {
				success: true;
				value: {
					best_rated_scores: RawSong[];
					recent_rated_scores: RawSong[];
				};
		  };
	return result;
}

function getPotentialBonus(score: number) {
	if (score >= 10_000_000) {
		return 2.0;
	}

	if (score >= 9_800_000) {
		return 1.0 + (score - 9_800_000) / 200_000;
	}

	if (score >= 9_500_000) {
		return (score - 9_500_000) / 300_000;
	}

	const bonus = (score - 9_500_000) / 300_000;
	return bonus > 0 ? bonus : 0;
}

type RawSong = {
	song_id: string;
	difficulty: number;
	modifier: 0;
	rating: number;
	score: number;
	perfect_count: number;
	near_count: number;
	miss_count: 5;
	clear_type: 1;
	title: {
		en: string;
		jp: string;
	};
	artist: string;
	time_played: number;
	bg: string;
};

type ResponseSong = {
	title: string;
	artist: string;
	id: string;

	difficulty: 'past' | 'present' | 'future' | 'beyond' | 'eternal';

	clearType: 'track_lost' | 'normal_clear' | 'full_recall' | 'pure_memory' | 'easy_clear' | 'hard_clear';
	ranking: 'ex_plus' | 'ex' | 'aa' | 'a' | 'b' | 'c' | 'd';

	rating: number;
	base: number;

	perfect: number;
	near: number;
	miss: number;

	timePlayed: number;
	backgroundName: string;
};

function getRanking(score: number) {
	if (score >= 99e5) return 'ex_plus';
	if (score >= 98e5) return 'ex';
	if (score >= 95e5) return 'aa';
	if (score >= 92e5) return 'a';
	if (score >= 89e5) return 'b';
	if (score >= 86e5) return 'c';
	return 'd';
}

function createResponseSong(rawSong: RawSong) {
	return {
		title: rawSong.title.en,
		artist: rawSong.artist,
		id: rawSong.song_id,

		difficulty: (['past', 'present', 'future', 'beyond', 'eternal'] as const)[rawSong.difficulty],
		clearType: (['track_lost', 'normal_clear', 'full_recall', 'pure_memory', 'easy_clear', 'hard_clear'] as const)[rawSong.clear_type],
		ranking: getRanking(rawSong.score),

		rating: rawSong.rating,
		base: rawSong.rating - getPotentialBonus(rawSong.score),

		perfect: rawSong.perfect_count,
		near: rawSong.near_count,
		miss: rawSong.miss_count,

		timePlayed: rawSong.time_played,
		backgroundName: rawSong.bg,
	} satisfies ResponseSong;
}

type UserData = {
	name: string;
	user_code: string;
	rating: number;
	character: number;
	icon: string;
	profile_image: string;
};

function extractUserData(rawUserData: {
	name: string;
	user_code: string;
	rating: number;
	character: number;
	character_stats: CharacterStat[];
}): UserData {
	const character = rawUserData.character_stats.find(
		(c) => c.character_id === rawUserData.character
	);
	return {
		name: rawUserData.name,
		user_code: rawUserData.user_code,
		rating: rawUserData.rating,
		character: rawUserData.character,
		icon: character?.icon || '',
		profile_image: character?.profile_image || '',
	};
}

async function createResponse(
	arcaeaServerResponse:
		| { success: false; error_code: number }
		| {
				success: true;
				value: {
					best_rated_scores: RawSong[];
					recent_rated_scores: RawSong[];
				};
		  },
	userData?: UserData,
) {
	if (!arcaeaServerResponse.success) {
		if (arcaeaServerResponse.error_code === 203) {
			return {
				success: false,
				message: '登录失败，可能是账号密码错误',
				error: 'login_failure',
			};
		}
		if (arcaeaServerResponse.error_code === 1401) {
			return {
				success: false,
				message: '无法查分，可能是Arcaea Online过期',
				error: 'query_failure',
			};
		}
		return {
			success: false,
			message: 'Arcaea服务器发生未知错误',
			error: 'unknown',
		};
	}
	return {
		success: true,
		b30: arcaeaServerResponse.value.best_rated_scores.map((v) => createResponseSong(v)),
		r10: arcaeaServerResponse.value.recent_rated_scores.map((v) => createResponseSong(v)),
		user: userData,
	};
}

export default {
	async fetch(request): Promise<Response> {
		try {
			if (request.method === 'OPTIONS') return new Response(null, { headers: CORSHeaders, status: 204 });
			const url = new URL(request.url);
			const pathname = url.pathname;

			if (request.method === 'POST' && pathname === '/query') {
				let email: string;
				let password: string;
				try {
					const body = (await request.json()) as {
						email: string;
						password: string;
					};
					if (typeof body.email !== 'string') throw new Error('email must be string');
					if (typeof body.password !== 'string') throw new Error('password must be string');
					email = body.email;
					password = body.password;
				} catch (e) {
					console.error(e);
					return Response.json({ success: false, message: 'bad request' }, { status: 400 });
				}
				const setCookies = await login(email, password);
				const cookieHeader = createCookieHeader(setCookies);
				const [rawData, userDataRaw] = await Promise.all([
					getRatingData(cookieHeader),
					getUserData(cookieHeader),
				]);
			const userData = userDataRaw.success && userDataRaw.value ? extractUserData(userDataRaw.value) : undefined;
			const responseData = await createResponse(rawData, userData);
			return Response.json(responseData, { headers: CORSHeaders });
			}

			// 图片代理 - 用于解决CORS问题
			if (request.method === 'GET' && pathname === '/cover') {
				const backgroundName = url.searchParams.get('name');
				if (!backgroundName) {
					return new Response('Missing name parameter', { status: 400, headers: CORSHeaders });
				}
				
				const imageUrl = `https://webassets.lowiro.com/${backgroundName}.jpg`;
				const imageRes = await fetch(imageUrl, {
					headers: {
						'Origin': 'https://arcaea.lowiro.com',
						'Referer': 'https://arcaea.lowiro.com/',
					},
				});
				
				if (!imageRes.ok) {
					return new Response('Image not found', { status: 404, headers: CORSHeaders });
				}
				
				const blob = await imageRes.blob();
				return new Response(blob, {
					headers: {
						...CORSHeaders,
						'Content-Type': blob.type || 'image/jpeg',
						'Cache-Control': 'public, max-age=86400',
					},
				});
			}

			// 角色头像代理
			if (request.method === 'GET' && pathname === '/char-icon') {
				const hash = url.searchParams.get('hash');
				if (!hash) {
					return new Response('Missing hash parameter', { status: 400, headers: CORSHeaders });
				}
				
				const imageUrl = `https://webassets.lowiro.com/chr/${hash}.png`;
				const imageRes = await fetch(imageUrl, {
					headers: {
						'Origin': 'https://arcaea.lowiro.com',
						'Referer': 'https://arcaea.lowiro.com/',
					},
				});
				
				if (!imageRes.ok) {
					return new Response('Image not found', { status: 404, headers: CORSHeaders });
				}
				
				const blob = await imageRes.blob();
				return new Response(blob, {
					headers: {
						...CORSHeaders,
						'Content-Type': blob.type || 'image/png',
						'Cache-Control': 'public, max-age=86400',
					},
				});
			}

			// 角色立绘代理
			if (request.method === 'GET' && pathname === '/char-profile') {
				const hash = url.searchParams.get('hash');
				if (!hash) {
					return new Response('Missing hash parameter', { status: 400, headers: CORSHeaders });
				}
				
				const imageUrl = `https://webassets.lowiro.com/profile/${hash}.png`;
				const imageRes = await fetch(imageUrl, {
					headers: {
						'Origin': 'https://arcaea.lowiro.com',
						'Referer': 'https://arcaea.lowiro.com/',
					},
				});
				
				if (!imageRes.ok) {
					return new Response('Image not found', { status: 404, headers: CORSHeaders });
				}
				
				const blob = await imageRes.blob();
				return new Response(blob, {
					headers: {
						...CORSHeaders,
						'Content-Type': blob.type || 'image/png',
						'Cache-Control': 'public, max-age=86400',
					},
				});
			}

			return new Response('Not Found', { status: 404, headers: CORSHeaders });
		} catch (e) {
			console.error(e);
			return new Response('Internal Server Error', { status: 500, headers: CORSHeaders });
		}
	},
} satisfies ExportedHandler<Env>;
