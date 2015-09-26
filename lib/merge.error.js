/**
 * Bases on https://gist.github.com/justmoon/15511f92e5216fa2624b
 */

'use strict';

var util = require('util');

/**
 * Wraps information about conflicts
 * @param message
 * @param choices - contains list of choices for resolve
 * @constructor
 */
module.exports = function MergeError(message, choices) {
	Error.captureStackTrace(this, this.constructor);
	this.name = this.constructor.name;
	this.message = message;
	this.choices = choices;
};

util.inherits(module.exports, Error);