const graphHelper = require('../../helpers/graph')
const safeRegex = require('safe-regex')
const _ = require('lodash')
const gql = require('graphql')
const { v4: uuid } = require('uuid')

/* global WIKI */

module.exports = {
  Query: {
    /**
     * FETCH ALL GROUPS
     */
    async groups (obj, args, context, info) {
      const cols = graphHelper.parseFields(info, ['userCount'])
      return WIKI.models.groups.query().select([
        ...cols.fields.map(f => `groups.${f}`),
        ...(cols.flags.userCount ? [WIKI.models.groups.relatedQuery('users').count().as('userCount')] : [])
      ]).orderBy('name')
    },
    /**
     * FETCH A SINGLE GROUP
     */
    async groupById (obj, args) {
      return WIKI.models.groups.query().findById(args.id)
    }
  },
  Mutation: {
    /**
     * ASSIGN USER TO GROUP
     */
    async assignUserToGroup (obj, args, { req }) {
      // Check for guest user
      if (args.userId === 2) {
        throw new gql.GraphQLError('Cannot assign the Guest user to a group.')
      }

      // Check for valid group
      const grp = await WIKI.models.groups.query().findById(args.groupId)
      if (!grp) {
        throw new gql.GraphQLError('Invalid Group ID')
      }

      // Check assigned permissions for write:groups
      if (
        WIKI.auth.checkExclusiveAccess(req.user, ['write:groups'], ['manage:groups', 'manage:system']) &&
        grp.permissions.some(p => {
          const resType = _.last(p.split(':'))
          return ['users', 'groups', 'navigation', 'theme', 'api', 'system'].includes(resType)
        })
      ) {
        throw new gql.GraphQLError('You are not authorized to assign a user to this elevated group.')
      }

      // Check for valid user
      const usr = await WIKI.models.users.query().findById(args.userId)
      if (!usr) {
        throw new gql.GraphQLError('Invalid User ID')
      }

      // Check for existing relation
      const relExist = await WIKI.models.knex('userGroups').where({
        userId: args.userId,
        groupId: args.groupId
      }).first()
      if (relExist) {
        throw new gql.GraphQLError('User is already assigned to group.')
      }

      // Assign user to group
      await grp.$relatedQuery('users').relate(usr.id)

      // Revoke tokens for this user
      WIKI.auth.revokeUserTokens({ id: usr.id, kind: 'u' })
      WIKI.events.outbound.emit('addAuthRevoke', { id: usr.id, kind: 'u' })

      return {
        status: graphHelper.generateSuccess('User has been assigned to group.')
      }
    },
    /**
     * CREATE NEW GROUP
     */
    async createGroup (obj, args, { req }) {
      const group = await WIKI.models.groups.query().insertAndFetch({
        name: args.name,
        permissions: JSON.stringify(WIKI.data.groups.defaultPermissions),
        rules: JSON.stringify(WIKI.data.groups.defaultRules.map(r => ({
          ...r,
          id: uuid()
        }))),
        isSystem: false
      })
      await WIKI.auth.reloadGroups()
      WIKI.events.outbound.emit('reloadGroups')
      return {
        status: graphHelper.generateSuccess('Group created successfully.'),
        group
      }
    },
    /**
     * DELETE GROUP
     */
    async deleteGroup (obj, args) {
      const grp = WIKI.models.groups.query().findById(args.id)
      if (grp.isSystem) {
        throw new gql.GraphQLError('Cannot delete this group.')
      }

      await WIKI.models.groups.query().deleteById(args.id)

      WIKI.auth.revokeUserTokens({ id: args.id, kind: 'g' })
      WIKI.events.outbound.emit('addAuthRevoke', { id: args.id, kind: 'g' })

      await WIKI.auth.reloadGroups()
      WIKI.events.outbound.emit('reloadGroups')

      return {
        status: graphHelper.generateSuccess('Group has been deleted.')
      }
    },
    /**
     * UNASSIGN USER FROM GROUP
     */
    async unassignUserFromGroup (obj, args) {
      if (args.userId === 2) {
        throw new gql.GraphQLError('Cannot unassign Guest user')
      }
      if (args.userId === 1 && args.groupId === 1) {
        throw new gql.GraphQLError('Cannot unassign Administrator user from Administrators group.')
      }
      const grp = await WIKI.models.groups.query().findById(args.groupId)
      if (!grp) {
        throw new gql.GraphQLError('Invalid Group ID')
      }
      const usr = await WIKI.models.users.query().findById(args.userId)
      if (!usr) {
        throw new gql.GraphQLError('Invalid User ID')
      }
      await grp.$relatedQuery('users').unrelate().where('userId', usr.id)

      WIKI.auth.revokeUserTokens({ id: usr.id, kind: 'u' })
      WIKI.events.outbound.emit('addAuthRevoke', { id: usr.id, kind: 'u' })

      return {
        status: graphHelper.generateSuccess('User has been unassigned from group.')
      }
    },
    /**
     * UPDATE GROUP
     */
    async updateGroup (obj, args, { req }) {
      // Check for unsafe regex page rules
      if (_.some(args.pageRules, pr => {
        return pr.match === 'REGEX' && !safeRegex(pr.path)
      })) {
        throw new gql.GraphQLError('Some Page Rules contains unsafe or exponential time regex.')
      }

      // Set default redirect on login value
      if (_.isEmpty(args.redirectOnLogin)) {
        args.redirectOnLogin = '/'
      }

      // Check assigned permissions for write:groups
      if (
        WIKI.auth.checkExclusiveAccess(req.user, ['write:groups'], ['manage:groups', 'manage:system']) &&
        args.permissions.some(p => {
          const resType = _.last(p.split(':'))
          return ['users', 'groups', 'navigation', 'theme', 'api', 'system'].includes(resType)
        })
      ) {
        throw new gql.GraphQLError('You are not authorized to manage this group or assign these permissions.')
      }

      // Update group
      await WIKI.models.groups.query().patch({
        name: args.name,
        redirectOnLogin: args.redirectOnLogin,
        permissions: JSON.stringify(args.permissions),
        pageRules: JSON.stringify(args.pageRules)
      }).where('id', args.id)

      // Revoke tokens for this group
      WIKI.auth.revokeUserTokens({ id: args.id, kind: 'g' })
      WIKI.events.outbound.emit('addAuthRevoke', { id: args.id, kind: 'g' })

      // Reload group permissions
      await WIKI.auth.reloadGroups()
      WIKI.events.outbound.emit('reloadGroups')

      return {
        status: graphHelper.generateSuccess('Group has been updated.')
      }
    }
  },
  Group: {
    async userCount (grp) {
      const result = await grp.$relatedQuery('users').count().first()
      return result?.count
    },
    async users (grp, args) {
      // -> Sanitize limit
      let limit = args.pageSize ?? 20
      if (limit < 1 || limit > 1000) {
        limit = 1000
      }

      // -> Sanitize offset
      let offset = args.page ?? 1
      if (offset < 1) {
        offset = 1
      }

      // -> Fetch Users
      return grp.$relatedQuery('users')
        .select('users.id', 'users.email', 'users.name', 'users.isSystem', 'users.isActive', 'users.createdAt', 'users.lastLoginAt')
        .where(builder => {
          if (args.filter) {
            builder.where('users.email', 'like', `%${args.filter}%`)
              .orWhere('users.name', 'like', `%${args.filter}%`)
          }
        })
        .orderBy(args.orderBy ?? 'users.name', `users.${args.orderByDirection}` ?? 'asc')
        .offset((offset - 1) * limit)
        .limit(limit)
    }
  }
}
