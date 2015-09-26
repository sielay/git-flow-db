# git-flow-db

Allows to store file versions using git-a-like-flow in database. So you can combine git way of thinking and mongodb replication. I needed that for configuration in one of my projects.

## Idea

 * It's file centric (doesn't have tree)
 * Git SHA1 are skipped as overkill here, MongoIDs are reliable enough
 * Repo/File information is stored in `__git_flow_repos`
 * Objects are stored in `__git_flow_objects` as raw versions
 * Index is stored in `__git_flow_index`
 * As in git you have one current head per repo

## Install

```
npm install --save git-flow-db
```

## Index

```
{
    "org" : "organisation",
    "doc" : "file",
    "version" : "979ffd132438c2313b1c51317d57d84c432553c8",
    "branch" : "master",
    "parent" : "517b101d97ed94afa87beb0bdeb357fb38af8ec1",
    "merge" : "fd996410cb9163cc01aee107e4d4320d189a5c7d",
    "committer" : "lukasz",
    "date" : "2012-04-23T18:25:43.511Z",
    "message" : "Merged",
    "org": 32
}
```

## Next steps

 * Fork/Merge
 * Current head in `__git_flow_index` to allow search

### Contribute

Fork -> Dev -> Test (CC >= 98.52%) -> Commit -> Pull Request -> Repeat

## License

MIT - because it's fun to share