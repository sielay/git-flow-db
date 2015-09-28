'use strict';

var mongo      = require('mongodb').MongoClient,
	ObjectID   = require('mongodb').ObjectID,
	Client     = require('./index').client,
	File       = require('./index').file,
	MergeError = require('./index').error,
	should     = require('should'),
	mockups    = require('./mockups'),
	pb         = require('node-promise-back'),
	patter     = require('patter')(function createPromise(func) {
		return new Promise(function (resolve, reject) {
			func(resolve, reject);
		});
	}),
	connection;

require('should-promised');

function shouldCounts(index, objects, repos, workspace) {

	return connection.collection(Client.COLLECTION_OBJECTS).count({})
		.then(function (count) {
			/* istanbul ignore next */
			if (count != objects) throw Error('Wrong number of objects ' + count + ' expected ' + objects);
			return connection.collection(Client.COLLECTION_WORKSPACE).count({});
		}).then(function (count) {
			/* istanbul ignore next */
			if (count != workspace) throw Error('Wrong number of workspace files ' + count + ' expected ' + workspace);
			return connection.collection(Client.COLLECTION_INDEX).count({});
		}).then(function (count) {
			/* istanbul ignore next */
			if (count != index) throw Error('Wrong number of index ' + count + ' expected ' + index);
			return connection.collection(Client.COLLECTION_REPOS).count({});
		}).then(function (count) {
			/* istanbul ignore next */
			if (count != repos) throw Error('Wrong number of repos ' + count + ' expected ' + repos);
			return true;
		});
}

describe('ClientClient basics', function () {


	it('Sets up', function () {

		var callback = pb.native();
		mongo.connect('mongodb://localhost/git-in-dev', callback);

		return callback.promise.then(function (db) {
			connection = db;
			return Client({
				mongo: db
			});
		}).then(function () {
			return Client.prune();
		}).then(function () {
			return shouldCounts(0, 0, 0, 0);
		});
	});


});

describe('Conflict detector', function () {

	it('Resolve clean case from example - clean', function () {

		Client.detectConflicts(
			[],
			[
				{'op': 'replace', 'path': '/value/v', 'value': 'D'},
				{'op': 'remove', 'path': '/z'}
			], [
				{'op': 'replace', 'path': '/value/v', 'value': 'ZZZ'}, {
					'op':    'add',
					'path':  '/z',
					'value': {
						'd': 1,
						'e': {'z': 1},
						'g': [1, 3, 4, 5]
					}
				}]
		);
	});

	it('Resolve clean case from example same patchs - clean', function () {

		Client.detectConflicts(
			[
				{'op': 'replace', 'path': '/value/v', 'value': 'D'}
			],
			[
				{'op': 'replace', 'path': '/value/v', 'value': 'D'}, {'op': 'remove', 'path': '/z'}
			],
			[
				{'op': 'replace', 'path': '/value/v', 'value': 'YYY'},
				{
					'op':    'add',
					'path':  '/z',
					'value': {'d': 1, 'e': 2, 'g': [1, 4, 5]}
				}
			]
		);
	});

	it('Resolve clean case from example - conflict', function () {

		var hadError = null;

		try {
			Client.detectConflicts(
				[
					{'op': 'replace', 'path': '/value/v', 'value': 'D'}
				],
				[
					{'op': 'replace', 'path': '/value/v', 'value': 'Z'}, {'op': 'remove', 'path': '/z'}
				],
				[
					{'op': 'replace', 'path': '/value/v', 'value': 'YYY'},
					{
						'op':    'add',
						'path':  '/z',
						'value': {'d': 1, 'e': 2, 'g': [1, 4, 5]}
					}
				]
			);
		} catch (exception) {
			hadError = exception;
		}
		should.exist(hadError);
		hadError.should.be.instanceOf(MergeError);

	});

});

describe('File contructor', function () {

	it('Creates', function () {

		new File({});
		return shouldCounts(0, 0, 0, 0);

	});

});

describe('ClientClient', function () {


	it('Stores object', function () {

		return patter.mapSeries(mockups.data, function (object) {

			return Client.storeObject(object).then(function (ID) {
				should.exists(ID);
				return Client.retrieveObject(ID);
			}).then(function (newObject) {
				should(newObject).be.eql(object);
				return true;
			});
		}).then(function () {
			return shouldCounts(0, 16, 0, 0);
		});

	});

	it('Handles undefined in store', function () {

		return Client.storeObject().then(function (ID) {
			should.exists(ID);
			return Client.retrieveObject(ID);
		}).then(function (newObject) {
			should(newObject).be.null;
			return true;
		}).then(function () {
			return shouldCounts(0, 17, 0, 0);
		}).then(function () {
			return Client.retrieveObject(ObjectID());
		}).then(function (nothing) {
			should.not.exist(nothing);
		});

	});

	it('Check for repo exists - before init', function () {

		return Client.exists(mockups.org, mockups.repo).then(function (exists) {
			exists.should.be.false;
			return Client.exists(mockups.org, mockups.repo1);
		}).then(function (exists) {
			exists.should.be.false;
			return Client.exists(mockups.org, mockups.repo2);
		}).then(function (exists) {
			exists.should.be.false;
			return Client.exists(mockups.org2, mockups.repo);
		}).then(function (exists) {
			exists.should.be.false;
			return Client.exists(mockups.org2, mockups.repo1);
		}).then(function (exists) {
			exists.should.be.false;
			return Client.exists(mockups.org2, mockups.repo2);
		}).then(function (exists) {
			exists.should.be.false;
			return true;
		}).then(function () {
			return shouldCounts(0, 17, 0, 0);
		});

	});

	it('Inits repository 1', function () {
		return Client.init(mockups.org, mockups.repo1).then(function (file) {
			should.exists(file);
			file.should.be.instanceOf(File);
			file.name().should.be.equal(mockups.repo1);
			file.org().should.be.equal(mockups.org);
			return true;
		}).then(function () {
			return shouldCounts(0, 17, 1, 0);
		});
	});

	it('Inits repository 2', function () {
		return Client.init(mockups.org2, mockups.repo1).then(function (file) {
			should.exists(file);
			file.should.be.instanceOf(File);
			file.name().should.be.equal(mockups.repo1);
			file.org().should.be.equal(mockups.org2);
			return true;
		}).then(function () {
			return shouldCounts(0, 17, 2, 0);
		});
	});

	it('Fails or reinit', function () {
		return Client.init(mockups.org2, mockups.repo1).should.be.rejected().then(function () {
			return shouldCounts(0, 17, 2, 0);
		});
	});

	it('Check for repo exists - after init', function () {

		return Client.exists(mockups.org, mockups.repo).then(function (exists) {
			exists.should.be.false;
			return Client.exists(mockups.org, mockups.repo1);
		}).then(function (exists) {
			exists.should.be.true;
			return Client.exists(mockups.org, mockups.repo2);
		}).then(function (exists) {
			exists.should.be.false;
			return Client.exists(mockups.org2, mockups.repo);
		}).then(function (exists) {
			exists.should.be.false;
			return Client.exists(mockups.org2, mockups.repo1);
		}).then(function (exists) {
			exists.should.be.true;
			return Client.exists(mockups.org2, mockups.repo2);
		}).then(function (exists) {
			exists.should.be.false;
			return true;
		}).then(function () {
			return shouldCounts(0, 17, 2, 0);
		});

	});

	it('Gets repo', function () {

		return Client.getFile(mockups.org, mockups.repo).then(function (file) {

			should.not.exists(file);
			return Client.getFile(mockups.org, mockups.repo1);

		}).then(function (file) {

			should.exists(file);
			file.should.be.instanceOf(File);
			file.name().should.be.equal(mockups.repo1);
			file.org().should.be.equal(mockups.org);
			return Client.getFile(mockups.org, mockups.repo2);

		}).then(function (file) {

			should.not.exists(file);
			return Client.getFile(mockups.org2, mockups.repo);

		}).then(function (file) {

			should.not.exists(file);
			return Client.getFile(mockups.org2, mockups.repo1);

		}).then(function (file) {

			should.exists(file);
			file.should.be.instanceOf(File);
			file.name().should.be.equal(mockups.repo1);
			file.org().should.be.equal(mockups.org2);
			return Client.getFile(mockups.org2, mockups.repo2);

		}).then(function (file) {
			should.not.exists(file);
			return true;
		}).then(function () {
			return shouldCounts(0, 17, 2, 0);
		});

	});

	it('List repos', function () {
		return Client.listForOrg(mockups.org).then(function (list) {
			return true;
		});
	});


});

describe('File contructor', function () {

	var Repo1, Repo2, firstCommit;

	before(function () {

		return Client.getFile(mockups.org, mockups.repo1).then(function (file) {
			Repo1 = file;
			return Client.getFile(mockups.org2, mockups.repo1);
		}).then(function (file) {
			Repo2 = file;
			return true;
		}).then(function () {
			return shouldCounts(0, 17, 2, 0);
		});

	});

	it('Finds all branches - after commits', function () {
		return Repo1.branches().then(function (list) {
			list.should.be.eql(['master']);
			return true;
		});
	});

	it(' |    git status -> empty ', function () {
		return Repo1.status().should.eventually.be.equal(File.STATUS_EMPTY).then(function () {
			return shouldCounts(0, 17, 2, 0);
		});
	});

	it(' |    git merge dev - nothing ', function () {
		Repo1.merge('dev').should.be.rejected();
	});


	it(' |    git reset - nothing ', function () {
		return Repo1.reset().should.be.rejected();
	});

	it(' |\\   git checkout -b dev -> error', function () {
		return Repo1.checkout('dev').should.be.rejected();
	});

	it(' |    git commit -> error ', function () {

		return Repo1.commit({
			message:   'ABC',
			committer: 'lukasz'
		}).should.be.rejected().then(function () {
				return shouldCounts(0, 17, 2, 0);
			});

	});

	it(' |    git add -> OK', function () {
		return Repo1.add({
			change: 1,
			value:  {
				v: 'B'
			},
			type:   [false]
		}).then(function () {
			return true;
		}).then(function () {
			return shouldCounts(0, 18, 2, 0);
		});
	});

	it(' |    git status -> changed', function () {
		return Repo1.status().should.eventually.be.equal(File.STATUS_CHANGED).then(function () {
			return shouldCounts(0, 18, 2, 0);
		});
	});

	it(' |    git merge dev - nothing ', function () {
		Repo1.merge('dev').should.be.rejected();
	});

	it(' |    git add -> changed ', function () {
		return Repo1.add({
			change: 1,
			value:  {
				v: 'C'
			},
			type:   [false]
		}).then(function () {
			return Repo1.status().should.eventually.be.equal(File.STATUS_CHANGED);
		}).then(function () {
			return shouldCounts(0, 18, 2, 0);
		});
	});

	it(' *    git commit -> OK - commit 1 ', function () {

		return Repo1.commit({
			message:   'commit 1',
			committer: 'lukasz'
		}).then(function () {
			firstCommit = Repo1.version();
			return true;
		}).then(function () {
			return shouldCounts(1, 18, 2, 0);
		}).then(function () {
			return Client.head(mockups.org, mockups.repo1, 'master');
		}).then(function (head) {
			should.exist(head);
			head.version.should.eql(Repo1.version());
			return true;
		});

	});

	it(' |    git status -> clean', function () {
		return Repo1.status().should.eventually.be.equal(File.STATUS_CLEAN).then(function () {
			return shouldCounts(1, 18, 2, 0);
		});
	});

	it(' |    git reset - nothing ', function () {
		return Repo1.reset().should.be.rejected();
	});

	it(' |    git add -> changed', function () {
		return Repo1.add({
			change: 1,
			value:  {
				v: 'D'
			},
			type:   [false]
		}).then(function () {
			return Repo1.status().should.eventually.be.equal(File.STATUS_CHANGED);
		}).then(function () {
			return shouldCounts(1, 19, 2, 0);
		});
	});

	it(' *    git commit -> OK - commit 2', function () {

		return Repo1.commit({
			message:   'commit 2',
			committer: 'lukasz'
		}).then(function () {
			return true;
		}).then(function () {
			return shouldCounts(2, 19, 2, 0);
		}).then(function () {
			return Client.head(mockups.org, mockups.repo1, 'master');
		}).then(function (head) {
			should.exist(head);
			head.version.should.eql(Repo1.version());
			return true;
		});

	});

	it(' |    git add -> changed', function () {
		return Repo1.add({
			change: 1,
			value:  {
				v: 'Z'
			},
			type:   [false]
		}).then(function () {
			return Repo1.status().should.eventually.be.equal(File.STATUS_CHANGED);
		}).then(function () {
			return shouldCounts(2, 20, 2, 0);
		});
	});

	it(' |\\   git checkout -b dev -> on dev', function () {
		return Repo1.checkout('dev').then(function () {
			return Repo1.status().should.eventually.be.equal(File.STATUS_CHANGED);
		}).then(function () {
			Repo1.branch().should.be.equal('dev');
			return shouldCounts(2, 20, 2, 0);
		});
	});

	it(' | *  git commit -> OK - commit 3', function () {

		return Repo1.commit({
			message:   'commit 3',
			committer: 'lukasz'
		}).then(function () {
			return true;
		}).then(function () {
			return shouldCounts(3, 20, 2, 0);
		}).then(function () {
			return Client.head(mockups.org, mockups.repo1, 'master');
		}).then(function (head) {
			should.exist(head);
			head.version.should.not.eql(Repo1.version());
			return Client.head(mockups.org, mockups.repo1, 'dev');
		}).then(function (head) {
			should.exist(head);
			head.version.should.eql(Repo1.version());
			return true;
		});

	});

	it(' | |  git add -> error (no real changes)', function () {
		return Repo1.add({
			change: 1,
			value:  {
				v: 'Z'
			},
			type:   [false]
		}).should.be.rejected().then(function () {
				return shouldCounts(3, 20, 2, 0);
			});
	});

	it(' | |  git checkout dev -> error', function () {
		return Repo1.checkout('dev').should.be.rejected();
	});

	it(' x |  git checkout master -> on master', function () {
		return Repo1.checkout('master').then(function () {
			Repo1.branch().should.be.equal('master');
			return shouldCounts(3, 20, 2, 0)
		});
	});

	it(' | x  git checkout dev -> on dev', function () {
		return Repo1.checkout('dev').then(function () {
			Repo1.branch().should.be.equal('dev');
			return shouldCounts(3, 20, 2, 0)
		});
	});

	it(' | |  git add -> changed', function () {
		return Repo1.add({
			change: 1,
			value:  {
				v: 'Y'
			},
			type:   [false]
		}).then(function () {
			return Repo1.status().should.eventually.be.equal(File.STATUS_CHANGED);
		}).then(function () {
			return shouldCounts(3, 21, 2, 0);
		});
	});

	it(' | |  git checkout master -> error', function () {
		return Repo1.checkout('master').should.be.rejected();
	});

	it(' | |  git reset -> clean', function () {
		return Repo1.reset().then(function () {
			return Repo1.status().should.eventually.be.equal(File.STATUS_CLEAN);
		}).then(function () {
			return shouldCounts(3, 20, 2, 0);
		});
	});

	it(' | *  git commit -a -> clean - commit 4', function () {

		return Repo1.commit({
			message:   'commit 4',
			committer: 'lukasz'
		}, {
			change: 1,
			value:  {
				v: 'ZZZ'
			},
			z:      {
				d: 1,
				e: {
					z: 1
				},
				g: [
					1, 3, 4, 5
				]
			},
			type:   [false]
		}).then(function () {
			return Repo1.status().should.eventually.be.equal(File.STATUS_CLEAN);
		}).then(function () {
			return shouldCounts(4, 21, 2, 0);
		});
	});

	it(' | |  git merge-base dev master', function () {
		return Repo1.commonBranchesAncestor('dev', 'master').then(function () {
			return true;
		})
	});

	it(' */|  git checkout master, git merge dev', function () {

		return Repo1.checkout('master').then(function () {
			return Repo1.merge('dev');
		}).then(function () {
			return true;
		}).then(function () {
			return shouldCounts(5, 22, 2, 0);
		}).then(function () {
			return Repo1.content();
		}).then(function (content) {
			content.should.be.eql({
				change: 1,
				value:  {v: 'ZZZ'},
				type:   [false],
				z:      {d: 1, e: {z: 1}, g: [1, 3, 4, 5]}
			});
			return true;
		});

	});

	it(' | |  git merge other - error', function () {
		return Repo1.merge('other').should.be.rejected();
	});

	// conflicts
	it(' * |  git commit -a -> clean - commit 5', function () {

		return Repo1.commit({
			message:   'commit 5',
			committer: 'lukasz'
		}, {
			change: 1,
			value:  {
				v: 'WWW'
			},
			type:   [false]

		}).then(function () {
			return Repo1.status().should.eventually.be.equal(File.STATUS_CLEAN);
		}).then(function () {
			return shouldCounts(6, 23, 2, 0);
		});
	});

	it(' | x  git checkout dev -> on dev', function () {
		return Repo1.checkout('dev').then(function () {
			return true;
		}).then(function () {
			return shouldCounts(6, 23, 2, 0);
		});

	});

	it(' | *  git commit -a - commit 6', function () {
		return Repo1.commit({
			message:   'commit 6',
			committer: 'lukasz'
		}, {
			change: 1,
			value:  {
				v: 'YYY'
			},
			z:      {
				d: 1,
				e: 2,
				g: [
					1, 4, 5
				]
			},
			type:   [false]

		}).then(function () {
			return Repo1.status().should.eventually.be.equal(File.STATUS_CLEAN);
		}).then(function () {
			return shouldCounts(7, 24, 2, 0);
		});
	});

	it(' x |  git checkout master -> on mster', function () {
		return Repo1.checkout('master').then(function () {
			return true;
		}).then(function () {
			return shouldCounts(7, 24, 2, 0);
		});
	});

	it(' |!|  git merge dev -> conflict', function () {
		return Repo1.merge('dev').should.be.rejected();
	});

	it(' |/|  git merge dev resolve -> ok', function () {
		return Repo1.merge('dev', {
			'/value/v': 'theirs'
		}).then(function () {
			return true;
		}).then(function () {
			return shouldCounts(8, 25, 2, 0);
		}).then(function () {
			return Repo1.content();
		}).then(function (content) {
			content.should.be.eql({
				change: 1,
				value:  {v: 'YYY'},
				type:   [false],
				z:      {d: 1, e: 2, g: [1, 4, 5]}
			});
			return true;
		});
	});

	it('Finds all branches - after commits', function () {
		return Repo1.branches().then(function (list) {
			list.should.be.eql(['master', 'dev']);
			return true;
		});
	});

	it('Generates tree', function () {
		return Client.generateTree(mockups.org, mockups.repo1).then(function (tree) {
			return true;
		});
	});

	it('Generates log', function () {
		return Repo1.log().then(function (tree) {
			return true;
		});
	});

});

describe('Secondary flow - fixing wrong tree', function () {

	var Repo2;

	before(function () {
		return Client.getFile(mockups.org2, mockups.repo1).then(function (file) {
			Repo2 = file;
			return true;
		});
	});

	it(' *   First commit', function () {
		return Repo2.commit({
			message : 'commit 1'
		}, {
			v : 0
		});
	});

	it(' |\\  Checkout dev', function() {
		return Repo2.checkout('dev');
	});

	it(' | * Commit 2', function() {
		return Repo2.commit({
			message : 'Commit 2'
		}, {
			v : 1
		});
	});

	it(' |/  Merge', function(){
		return Repo2.checkout('master').then(function(){
			return Repo2.merge('dev');
		});
	});

	it(' * | Commit 3', function(){
		return Repo2.commit({
			message: 'Commit 3'
		}, {
			v: 2
		});
	});

	it(' | x Checkout dev', function(){
		return Repo2.checkout('dev').then(function(repo){
			return true;
		});
	});

	it(' | * Commit 4', function(){
		return Repo2.commit({
			message: 'Commit 4'
		}, {
			v: 3
		})
	});

	it(' |x| Merge - expect error', function() {
		return Repo2.checkout('master').then(function(){
			return Repo2.merge('dev');
		}).then(function(){
			throw 'Expect error'
		}, function(err) {
			should.exist(err);
			err.should.be.instanceOf(MergeError);
			return true;
		});
	});

});

after(function (next) {
	connection.close();
	next();
});

