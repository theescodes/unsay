/** @type {import('@commitlint/types').UserConfig} */
export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		// Allow German nouns to stay capitalized in subjects. The 100-char
		// body/footer caps come from the extended preset.
		'subject-case': [0]
	}
};
