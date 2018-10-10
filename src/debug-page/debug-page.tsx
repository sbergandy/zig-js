import Vue from 'vue';
import {Options} from '../_common/options';

Vue.component("DebugPage", {
    template: `
        <div>
            <div><label><input type="checkbox" v-model="logging"/> Enable logging to console</label></div>
            <div><label><input type="checkbox" v-model="hasWinningClassOverride"/> Enable winning class override</label></div>
            <div v-if="hasWinningClassOverride">
                <div><label><input type="number" v-model.number="winningClassOverride.winningClass"/> winning class override</label></div>
                <div><label><input type="number" v-model.number="winningClassOverride.scenarioId"/> scenario id eoverride</label></div>
            </div>
        </div>
       `,

    data() {
        return {
            logging: Options.logging,
            hasWinningClassOverride: Options.winningClassOverride != null,
            winningClassOverride: Options.winningClassOverride,
        };
    },

    watch: {
        logging(newValue) {
            Options.logging = newValue;
        },

        winningClassOverride: {
            deep: true,
            handler(newValue) {
                Options.winningClassOverride = newValue;
            },

        },

        hasWinningClassOverride(newValue) {
            this.winningClassOverride = newValue ? {scenarioId: 0, winningClass: 0} : null;
        },
    },
});

window.onload = () => {
    new Vue({
        el: '#page',
        template: `<DebugPage/>`,
    });
};
