<template lang='pug'>
q-page.admin-locale
  .row.q-pa-md.items-center
    .col-auto
      img.admin-icon.animated.fadeInLeft(src='/_assets/icons/fluent-change-theme.svg')
    .col.q-pl-md
      .text-h5.text-primary.animated.fadeInLeft {{ $t('admin.sites.title') }}
      .text-subtitle1.text-grey.animated.fadeInLeft.wait-p2s {{ $t('admin.sites.subtitle') }}
    .col-auto
      q-btn.q-mr-sm.acrylic-btn(
        icon='las la-question-circle'
        flat
        color='grey'
        type='a'
        href='https://docs.js.wiki/admin/sites'
        target='_blank'
        )
      q-btn.q-mr-sm.acrylic-btn(
        icon='las la-redo-alt'
        flat
        color='secondary'
        @click='refresh'
        )
      q-btn(
        unelevated
        icon='las la-plus'
        :label='$t(`admin.sites.new`)'
        color='primary'
        @click='createSite'
        )
  q-separator(inset)
  .row.q-pa-md.q-col-gutter-md
    .col-12
      q-card.shadow-1
        q-list(separator)
          q-item(
            v-for='site of sites'
            :key='site.id'
            )
            q-item-section(side)
              q-icon(name='las la-chalkboard', color='primary')
            q-item-section
              strong {{site.title}}
            q-item-section
              div
                q-chip.q-mx-none(
                  v-if='site.hostname !== `*`'
                  square
                  color='blue-7'
                  text-color='white'
                  size='sm'
                  )
                  q-avatar(
                    icon='las la-angle-right'
                    color='blue-5'
                    text-color='white'
                  )
                  span {{site.hostname}}
                q-chip.q-mx-none(
                  v-else
                  square
                  color='indigo-7'
                  text-color='white'
                  size='sm'
                  )
                  q-avatar(
                    icon='las la-asterisk'
                    color='indigo-5'
                    text-color='white'
                  )
                  span catch-all
            q-item-section(side)
              q-toggle(
                :model-value='site.isEnabled'
                color='primary'
                checked-icon='las la-check'
                unchecked-icon='las la-times'
                :label='$t(`admin.sites.isActive`)'
                :aria-label='$t(`admin.sites.isActive`)'
                @update:model-value ='(val) => { toggleSiteState(site, val) }'
                )
            q-separator.q-ml-md(vertical)
            q-item-section(side, style='flex-direction: row; align-items: center;')
              q-btn.acrylic-btn.q-mr-sm(
                flat
                @click='editSite(site)'
                icon='las la-pen'
                color='indigo'
                :label='$t(`common.actions.edit`)'
                no-caps
                )
              q-btn.acrylic-btn(
                flat
                icon='las la-trash'
                color='accent'
                @click='deleteSite(site)'
                )
</template>

<script>
import { get } from '@requarks/vuex-pathify'
import { copyToClipboard, createMetaMixin } from 'quasar'

import SiteActivateDialog from '../components/SiteActivateDialog.vue'
import SiteCreateDialog from '../components/SiteCreateDialog.vue'
import SiteDeleteDialog from '../components/SiteDeleteDialog.vue'

export default {
  mixins: [
    createMetaMixin(function () {
      return {
        title: this.$t('admin.sites.title')
      }
    })
  ],
  data () {
    return {
      loading: false
    }
  },
  computed: {
    sites: get('admin/sites')
  },
  methods: {
    copyID (uid) {
      copyToClipboard(uid).then(() => {
        this.$q.notify({
          type: 'positive',
          message: this.$t('common.clipboard.uuidSuccess')
        })
      }).catch(() => {
        this.$q.notify({
          type: 'negative',
          message: this.$t('common.clipboard.uuidFailure')
        })
      })
    },
    async refresh () {
      await this.$store.dispatch('admin/fetchSites')
      this.$q.notify({
        type: 'positive',
        message: this.$t('admin.sites.refreshSuccess')
      })
    },
    createSite () {
      this.$q.dialog({
        component: SiteCreateDialog
      })
    },
    editSite (st) {
      this.$store.set('admin/currentSiteId', st.id)
      this.$router.push('/_admin/general')
    },
    toggleSiteState (st, newState) {
      this.$q.dialog({
        component: SiteActivateDialog,
        componentProps: {
          site: st,
          value: newState
        }
      })
    },
    deleteSite (st) {
      this.$q.dialog({
        component: SiteDeleteDialog,
        componentProps: {
          site: st
        }
      })
    }
  },
  mounted () {
    this.$store.dispatch('admin/fetchSites')
  }
}
</script>
