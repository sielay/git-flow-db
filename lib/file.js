'use strict';

var
	GitClient = require('./client'),
	jsonpatch = require('jsonpatch'),
	HEAD      = 'HEAD';

function File(rawData) {
	this._name = rawData.doc;
	this._org = rawData.org;
	this._work = rawData.work || null;
	this._tree = rawData.tree || 'master';
	this._branch = rawData.branch || 'master';
}

File.prototype.name = function () {
	return this._name;
};

File.prototype.org = function () {
	return this._org;
};

File.prototype.branch = function () {
	return this._branch;
};

File.prototype.status = function () {


	var self = this;

	return new Promise(function (resolve) {

		if (self._work === null) {

			return resolve(File.STATUS_EMPTY);
		}

		GitClient.indexed(self._org, self._name, self._work).then(function (exists) {

			var status = exists ? File.STATUS_CLEAN : File.STATUS_CHANGED;

			resolve(status);
		});

	});
};


File.prototype.reset = function () {

	var self = this, oldVersion;

	return this.status().then(function (status) {
		if (status !== File.STATUS_CHANGED) throw Error('Repository is clean already');
		return self.head(self.branch());
	}).then(function (head) {
		oldVersion = self._work;
		return self._setWorkingCopy(head ? head.version : null);
	}).then(function () {
		return GitClient.removeFromIndex(oldVersion);
	}).then(function () {
		return self;
	});

};

File.prototype.head = function (branch) {
	return GitClient.head(this._org, this._name, branch);
};

/**
 * Checks out branch
 * @param branch
 * @returns {Promise}
 */
File.prototype.checkout = function (branch) {

	var self = this;

	if (branch === self._branch) return new Promise(function (resolve, reject) {
		reject('Already on branch ' + branch);
	});

	return this.status().then(function (status) {

		if (status === File.STATUS_EMPTY) throw Error('Repository has to start from master');
		if (status === File.STATUS_CLEAN) return self.head(branch).then(function (head) {

			self._branch = branch;
			if (head) {
				self._work = head.version;
				self._branch = head.branch;
				self._tree = head.branch;
			}
			return true;
		});

		return self.head(branch).then(function (head) {
			if (head) throw Error('You can\'t checkout existing branch with uncommitted changes in current one');
			return self._setWorkingCopy(self._work, branch);
		});

	});

};


File.prototype.commit = function (options, data) {

	var self = this;

	if (data) {
		return this.add(data).then(function () {
			return self.commit(options);
		});
	}

	options = options || {};

	return this.status().then(function (status) {

		if (status !== File.STATUS_CHANGED) throw Error('No changes to commit');
		return GitClient.head(self._org, self._name, (options && options.merged) ? self._branch : self._tree);

	}).then(function (head) {

		return GitClient.index(self._org, self._name, self._work, self._branch, {
			parent:    head ? head.version : null,
			merge:     options.merged,
			message:   options.message,
			committer: options.committer,
			ord:       ((head && head.ord) ? head.ord : 0 ) + 1
		}).then(function (id) {
			self._tree = self._branch;
			return GitClient.updateFile({
				org: self._org,
				doc: self._name
			}, {
				$set: {
					tree: self._branch

				}
			});
		});

	}).then(function () {
		return self;
	});
};

/**
 * Adds current version
 * @param version
 * @returns {Promise}
 */
File.prototype.add = function (version) {


	var self = this;

	return this.status().then(function (status) {

		if (status === File.STATUS_EMPTY) return GitClient.storeObject(version).then(function (ID) {
			return self._setWorkingCopy(ID);
		});

		if (status === File.STATUS_CLEAN) return GitClient.compare(self._work, version, true).then(function (diff) {

			if (diff.length === 0) throw Error('No changes');

			return GitClient.storeObject(version).then(function (ID) {
				return self._setWorkingCopy(ID);
			});

		});

		return GitClient.storeObject(version, self._work).then(function () {
			return self;
		});
	});

};

File.prototype.content = function () {
	return GitClient.retrieveObject(this._work);
};

File.prototype._setWorkingCopy = function (ID, branch) {


	var self = this, query = {
		work: ID
	};

	if (!!branch) query.branch = branch;

	return GitClient.updateFile({
		org: self._org,
		doc: self._name
	}, {
		$set: query
	}).then(function () {
		self._work = ID;
		if (!!branch) self._branch = branch;
		return self;
	});
};


File.prototype.merge = function (branch, resolutions) {

	var self = this, patch, merged;

	return self.status().then(function (status) {

		if (status === File.STATUS_EMPTY) throw Error('Can\'t merge into empty branch');
		if (status === File.STATUS_CHANGED) throw Error('Can\'t merge to uncommitted branch');
		return self.head(branch)
	}).then(function (head) {
		merged = head.version;
		return self.commonBranchesAncestor(self._branch, branch);
	}).then(function (ancestor) {
		return self.getPatch(ancestor || self._work, self._work, merged, resolutions);
	}).then(function (_patch) {
		patch = _patch;
		return GitClient.retrieveObject(self._work);
	}).then(function (content) {

		return self.commit({
			message: 'Merge ' + merged + ' into ' + self._work,
			merged:  merged
		}, jsonpatch.apply_patch(content, patch));
	});
};

function undo(path, changeset) {
	var index = -1;
	changeset.forEach(function (change, i) {
		if (change.path === path) index = i;
	});
	if (index > -1) {
		changeset.splice(index, 1);
	}
}

File.prototype.getPatch = function (ancestor, mine, theirs, resolutions) {
	var ancestorToMine,
		ancestorToTheirs;

	return GitClient.compare(ancestor, mine).then(function (delta) {
		ancestorToMine = delta;
		return GitClient.compare(ancestor, theirs);
	}).then(function (delta) {

		if (resolutions) {
			Object.keys(resolutions).forEach(function (resolutionPath) {
				undo(resolutionPath, resolutions[resolutionPath] === 'theirs' ? ancestorToMine : ancestorToTheirs);
			});
		}

		ancestorToTheirs = delta;
		GitClient.detectConflicts(ancestorToMine, ancestorToTheirs);
		return ancestorToTheirs;
	});
};

File.prototype.commonBranchesAncestor = function (branchA, branchB) {
	var self = this, versionA;

	return this.head(branchA).then(function (head) {
		versionA = head.version;
		return self.head(branchB);
	}).then(function (head) {
		return self.commonAncestor(versionA, head.version, branchA, branchB);
	});
};

File.prototype.commonAncestor = function (versionA, versionB, branchA, branchB) {

	var self = this;

	return GitClient.walkIndexUntilBranch(self._org, self._name, versionB, branchA, versionA).then(function (found) {
		if (found) return found;
		return GitClient.walkIndexUntilBranch(self._org, self._name, versionA, branchB, versionB).then(function (found) {
			return found;
		});
	});
};

File.prototype.branches = function () {
	var self = this;
	return GitClient.branches(this._org, this._name).then(function (list) {
		if (list.indexOf(self._branch) === -1) list.push(self._branch);

		return list;
	});
};

File.prototype.version = function () {
	return this._work || HEAD;
};

File.exists = function () {

};

File.STATUS_CLEAN = 'clean';
File.STATUS_CHANGED = 'changed';
File.STATUS_EMPTY = 'empty';

module.exports = File;