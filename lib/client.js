'use strict';

var
	MergeError           = require('./merge.error'),
	mongo                = require('mongodb'),
	ObjectID             = mongo.ObjectID,
	diff                 = require('rfc6902-json-diff'),
	extend               = require('util')._extend,
	HEAD                 = 'HEAD',
	MASTER               = 'master',
	COLLECTION_OBJECTS   = '__git_flow_db_objects',
	COLLECTION_WORKSPACE = '__git_flow_db_workspace',
	COLLECTION_INDEX     = '__git_flow_index',
	COLLECTION_REPOS     = '__git_flow_repos';

function ID(id) {
	if(typeof id === 'string') return new ObjectID(id);
	return id;
}

/**
 * Creates client
 * @param options
 * @param options.mongo - mongo client (as form mongodb package
 * @returns {Promise}
 * @constructor
 */
function GitClient(options) {

	return new Promise(function (resolve) {

		if (options) {
			if (options.mongo) GitClient._mongo = options.mongo;
		}
		resolve();
	});
}

/**
 * Drops all data
 * @returns {Promise}
 */
GitClient.prune = function () {
	return GitClient._mongo.collection(GitClient.COLLECTION_OBJECTS).removeMany({}).then(function () {
		return GitClient._mongo.collection(GitClient.COLLECTION_WORKSPACE).removeMany({});
	}).then(function () {
		return GitClient._mongo.collection(GitClient.COLLECTION_INDEX).removeMany({});
	}).then(function () {
		return GitClient._mongo.collection(GitClient.COLLECTION_REPOS).removeMany({});
	});
};

/**
 * Stores object in objects collection
 * @param {Mixed}object
 * @param {String|ObjectId|undefined} id
 * @returns {Promise}
 */
GitClient.storeObject = function (object, id) {

	var promise;

	if (id) {
		promise = GitClient._mongo.collection(COLLECTION_OBJECTS).updateOne({
			_id: id
		}, {
			_id:  id,
			blob: object
		});
	} else {
		id = new ObjectID();
		promise = GitClient._mongo.collection(COLLECTION_OBJECTS).insertOne({
			_id:  id,
			blob: object
		});
	}

	return promise.then(function () {
		return id;
	});

};

GitClient.removeFromIndex = function (id) {
	return GitClient._mongo.collection(COLLECTION_OBJECTS).removeOne({
		_id: id
	});
};

/**
 * Gets object from store
 * @param {String|ObjectId} id
 * @returns {Promise}
 */
GitClient.retrieveObject = function (id) {


	return GitClient._mongo.collection(COLLECTION_OBJECTS).findOne({
		_id: ID(id)
	}).then(function (data) {
		if (!data) return null;
		return data.blob;
	});

};

/**
 * Gets File
 * @param organisation
 * @param file
 * @returns {Promise}
 */
GitClient.getFile = function (oranisation, file) {


	return GitClient._mongo.collection(COLLECTION_REPOS).findOne({
		org: oranisation,
		doc: file
	}).then(function (rawData) {

		if (!rawData) return null;

		return new (require('./file'))(rawData);
	});

};

GitClient.listForOrg = function (oranisation) {

	return new Promise(function (resolve, reject) {

		GitClient._mongo.collection(COLLECTION_REPOS).find({
			org: oranisation
		}).toArray(function (err, list) {
			/* istanbul ignore next */
			if (err) reject(err);
			var result = [];
			list.forEach(function (file) {
				result.push(new (require('./file'))(file));
			});
			resolve(result);
		});
	});

};

GitClient.updateFile = function (query, update) {
	return GitClient._mongo.collection(COLLECTION_REPOS).updateOne(query, update);
};

/*
 * Uncomment this method only for development to not spoil code coverage and tets
 * @param organistation
 * @param file
 * @param version
 * @param indent
 * @returns {Promise}
 *
 GitClient.debugTree = function (organistation, file, version, indent) {

 var patter = require('patter')(function createPromise(func) {
 return new Promise(function (resolve, reject) {
 func(resolve, reject);
 });
 });

 if (!indent) indent = 0;
 var space = '  '.repeat(indent);

 return GitClient.getIndex(organistation, file, version).then(function (index) {
 console.log(space + index.branch + ' ' + index.version + '<-' + index.parent + ' ' + index.message);
 return GitClient.children(organistation, file, version).then(function (list) {

 return patter.mapSeries(list, function (innerVersion) {
 return GitClient.debugTree(organistation, file, innerVersion, indent + 1);
 });
 });
 });


 };
 */

GitClient.children = function (organistation, file, version) {

	return new Promise(function (resolve, reject) {
		GitClient._mongo.collection(COLLECTION_INDEX).find({
			org:    organistation,
			doc:    file,
			parent: version
		}).toArray(function (err, list) {
			/* istanbul ignore next */
			if (err) return reject(err);
			var clean = [];
			list.forEach(function (version) {
				clean.push(version.version);
			});
			resolve(clean);
		});
	});
};

/**
 *
 * @param left - left version
 * @param right - right version
 * @returns {Promise}
 */
GitClient.compare = function (left, right, rightData) {

	var leftContent;

	return GitClient.retrieveObject(left).then(function (content) {
		leftContent = content;

		if (rightData) return right;
		return GitClient.retrieveObject(right);
	}).then(function (content) {
		var result = diff(leftContent, content);
		return result;
	});

};

GitClient.walkIndexUntilBranch = function (organisation, file, version, branch, otherVersion) {

	return GitClient.getIndex(organisation, file, version).then(function (index) {

		if (!index || !index.parent) return false;
		if (index.branch === branch) return index.version;
		if (index.parent === otherVersion) otherVersion;

		return GitClient.walkIndexUntilBranch(organisation, file, index.parent, branch);

	});

};

/**
 * Checks if file exists
 * @param organisation
 * @param file
 * @returns {Promise}
 */
GitClient.exists = function (organisation, file) {


	return GitClient._mongo.collection(COLLECTION_REPOS).count({
		org: organisation,
		doc: file
	}).then(function (count) {
		return count > 0;
	});
};

/**
 * Creates new file
 * @param {String} organisation
 * @param {String} file
 * @returns {Promise}
 */
GitClient.init = function (organisation, file) {

	return GitClient.exists(organisation, file).then(function (exists) {

		if (exists) throw Error('Repository ' + organisation + '/' + file + ' exists');

		return GitClient._mongo.collection(COLLECTION_REPOS).insertOne({
			org:    organisation,
			doc:    file,
			work:   null,
			branch: MASTER,
			tree:   MASTER
		});
	}).then(function () {
		return GitClient.getFile(organisation, file);
	});

};

/**
 *
 * @param oranisation
 * @param file
 * @param version
 * @param branch
 * @param mixin
 * @param mixin.parent
 * @param mixin.merge
 * @param mixin.committer
 * @param mixin.message
 * @returns {Promise}
 */
GitClient.index = function (oranisation, file, version, branch, mixin) {

	var object = {
		org:     oranisation,
		doc:     file,
		version: version,
		branch:  branch,
		date:    new Date()
	};

	if (mixin) object = extend(object, mixin);

	return GitClient._mongo.collection(COLLECTION_INDEX).insertOne(object);

};

GitClient.head = function (organisation, file, branch) {

	return new Promise(function (resolve, reject) {

		GitClient._mongo.collection(COLLECTION_INDEX).find({
			org:    organisation,
			doc:    file,
			branch: branch
		}).sort({
			ord: -1
		}).limit(1).toArray(function (err, list) {
			if (err) return reject(err);
			resolve(list[0])
		});
	});
};

/**
 * Gets index info
 * @param organisation
 * @param file
 * @param version
 * @returns {Promise}
 */
GitClient.getIndex = function (organisation, file, version) {

	return GitClient._mongo.collection(COLLECTION_INDEX).findOne({
		org:     organisation,
		doc:     file,
		version: version
	});
};

/**
 * Checks if element exists in index, easiest way to determine dirty head
 * @param organisation
 * @param file
 * @param version
 * @returns {Promise}
 */
GitClient.indexed = function (organisation, file, version) {

	return GitClient._mongo.collection(COLLECTION_INDEX).count({
		org:     organisation,
		doc:     file,
		version: version
	}).then(function (count) {
		return count > 0;
	});
};

GitClient.detectConflicts = function (A, B) {
	var map = {}, conflicts = [];

	function iterate(operation) {
		map[operation.path] = map[operation.path] || [];
		var isUnique = true;
		map[operation.path].forEach(function (operation2) {
			if (
				operation2.path === operation.path &&
				operation2.value === operation.value &&
				operation2.op === operation2.op
			) isUnique = false;
		});

		if (isUnique) {
			map[operation.path].push(operation);
			if (map[operation.path].length >= 2) {
				conflicts.push(map[operation.path]);
			}
		}
	}

	A.forEach(iterate);
	B.forEach(iterate);

	if (conflicts.length > 0) {
		throw new MergeError('Conflict detected', conflicts);
	}

	return true;
};

GitClient.COLLECTION_INDEX = COLLECTION_INDEX;
GitClient.COLLECTION_OBJECTS = COLLECTION_OBJECTS;
GitClient.COLLECTION_WORKSPACE = COLLECTION_WORKSPACE;
GitClient.COLLECTION_REPOS = COLLECTION_REPOS;

module.exports = GitClient;