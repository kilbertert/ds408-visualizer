from __future__ import annotations

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

TOPICS = {
    "sorting": {"title": "排序", "items": [
        {"id": "bubble", "name": "冒泡排序"}, {"id": "selection", "name": "选择排序"}, {"id": "insertion", "name": "插入排序"},
        {"id": "shell", "name": "希尔排序"}, {"id": "heap_sort", "name": "堆排序"}, {"id": "quick", "name": "快速排序"}, {"id": "merge", "name": "归并排序"},
        {"id": "radix_sort", "name": "基数排序"}, {"id": "external_merge_sort", "name": "外部排序多路归并"}, {"id": "loser_tree", "name": "败者树"}, {"id": "optimal_merge_tree", "name": "最佳归并树"}, {"id": "replacement_selection", "name": "置换选择排序"},
    ]},
    "search": {"title": "查找", "items": [
        {"id": "seq_search", "name": "顺序查找"}, {"id": "binary_search", "name": "折半查找"}, {"id": "block_search", "name": "分块查找"},
        {"id":"hash_functions","name":"散列函数构造"}, {"id":"hash_linear","name":"散列表线性探测"}, {"id":"hash_chain","name":"散列表链地址法"}, {"id":"hash_conflict_compare","name":"散列冲突解决"},
    ]},
    "array_matrix": {"title":"数组 / 特殊矩阵", "items":[
        {"id":"symmetric_matrix","name":"对称矩阵压缩存储"}, {"id":"triangular_matrix","name":"三角矩阵压缩存储"}, {"id":"tridiagonal_matrix","name":"三对角矩阵压缩存储"}, {"id":"sparse_matrix","name":"稀疏矩阵三元组表"},
    ]},

    "computer_organization": {"title":"计算机组成原理", "items":[
        {"id":"co_hardware_overview","name":"硬件部件总览"}, {"id":"co_model_machine","name":"模型机：取指与 ADD 指令执行"},
        {"id":"co_instruction_cycle","name":"指令周期"}, {"id":"co_datapath_control","name":"数据通路与控制信号"},
        {"id":"co_memory_addressing","name":"主存容量与 MAR/MDR 计算"},
        {"id":"co_memory_components","name":"存储器基本组成与读写原理"}, {"id":"co_sram_chip_design","name":"SRAM 芯片组成存储器计算"},
        {"id":"co_memory_cpu_connection","name":"主存与 CPU 的连接"}, {"id":"co_cache_workflow","name":"Cache 工作原理"},
        {"id":"co_cache_mapping","name":"Cache 与主存三种映射"}, {"id":"co_cache_replacement","name":"Cache 替换算法"},
        {"id":"co_disk_working","name":"磁盘工作原理"}, {"id":"co_disk_access_time","name":"磁盘读取时间计算"},
        {"id":"co_instruction_addressing","name":"指令寻址"}, {"id":"co_operand_addressing","name":"数据寻址方式"},
        {"id":"co_procedure_call","name":"过程调用的机器级表示"},
        {"id":"co_complement_overflow","name":"补码加减与溢出判断"}, {"id":"co_floating_point","name":"浮点数规格化"},
        {"id":"co_io_interrupt_dma","name":"I/O 查询/中断/DMA"}, {"id":"co_performance_pipeline","name":"CPU 性能公式与流水线"},
        {"id":"co_exam_skills","name":"组成原理 408 高频技巧"},
    ]},
    "tree": {"title": "树 / 二叉树 / 高级树", "items": [
        {"id": "binary_tree_create", "name": "普通二叉树创建"}, {"id": "complete_binary_tree", "name": "完全二叉树与顺序存储"},
        {"id": "bst_insert", "name": "二叉排序树插入"}, {"id": "bst_search", "name": "二叉排序树查找"}, {"id": "bst_delete", "name": "二叉排序树删除"},
        {"id": "tree_update", "name": "树结点修改"}, {"id": "preorder", "name": "先序遍历"}, {"id": "inorder", "name": "中序遍历"},
        {"id": "postorder", "name": "后序遍历"}, {"id": "levelorder", "name": "层序遍历"}, {"id": "traversal_compare", "name": "三种遍历对比演示"},
        {"id": "avl_insert", "name": "AVL 插入旋转总览"}, {"id": "avl_ll", "name": "AVL LL 型：右旋"}, {"id": "avl_rr", "name": "AVL RR 型：左旋"},
        {"id": "avl_lr", "name": "AVL LR 型：先左后右"}, {"id": "avl_rl", "name": "AVL RL 型：先右后左"},
        {"id": "btree_search", "name": "B 树查找"}, {"id": "btree_insert", "name": "B 树插入与分裂"}, {"id": "btree_delete", "name": "B 树删除借位/合并"},
        {"id": "bplus_search", "name": "B+ 树范围查找"}, {"id": "bplus_insert", "name": "B+ 树插入与叶子链"}, {"id": "rb_insert", "name": "红黑树插入修正"},
        {"id": "forest_convert", "name": "树/森林/二叉树转换"}, {"id": "huffman_tree", "name": "哈夫曼树构造与哈夫曼编码"},
        {"id": "threaded_inorder", "name": "中序线索二叉树构造"}, {"id": "threaded_preorder", "name": "先序线索二叉树构造"}, {"id": "threaded_postorder", "name": "后序线索二叉树构造"},
        {"id": "build_thread_pre_in", "name": "前序+中序构造并线索化"}, {"id": "build_thread_post_in", "name": "后序+中序构造并线索化"}, {"id": "build_thread_level_in", "name": "层次+中序构造并线索化"},
    ]},
    "graph": {"title": "图", "items": [
        {"id": "graph_storage", "name": "图的四种存储结构"}, {"id": "graph_directed", "name": "有向图"}, {"id": "graph_undirected", "name": "无向图"},
        {"id": "graph_matrix_bfs", "name": "邻接矩阵 BFS"}, {"id": "graph_matrix_dfs", "name": "邻接矩阵 DFS"},
        {"id": "graph_adjlist_bfs", "name": "邻接表 BFS"}, {"id": "graph_adjlist_dfs", "name": "邻接表 DFS"},
        {"id": "dfs_forest_components", "name": "DFS 生成树/森林与连通分量"}, {"id": "graph_bfs", "name": "BFS"}, {"id": "graph_dfs", "name": "DFS"},
        {"id": "dijkstra", "name": "Dijkstra"}, {"id": "toposort", "name": "拓扑排序"}, {"id": "reverse_toposort", "name": "逆拓扑排序"}, {"id": "aoe_critical_path", "name": "AOE 网与关键路径"},
    ]},
    "expression": {"title": "表达式 / 栈应用", "items": [
        {"id": "infix_to_postfix", "name": "复杂中缀转后缀"}, {"id": "expression_two_stack", "name": "表达式求值双栈法"}, {"id": "expr_tree_convert", "name": "复杂三式互转画树法"},
    ]},
    "string_set": {"title": "串 / 集合", "items": [
        {"id": "kmp_next", "name": "KMP next 数组构造"}, {"id": "kmp_match", "name": "KMP 模式匹配"}, {"id":"kmp_nextval","name":"KMP nextval 优化"}, {"id": "union_find", "name": "并查集"},
    ]},
    "linear": {"title": "线性结构", "items": [
        {"id": "stack", "name": "栈"}, {"id": "queue", "name": "队列"}, {"id":"sequential_queue","name":"顺序循环队列"}, {"id":"linked_queue","name":"链式队列"}, {"id":"deque_demo","name":"双端队列"}, {"id":"stack_recursion","name":"栈在递归中应用"}, {"id":"bracket_matching","name":"括号匹配"}, {"id": "seq_list_insert", "name": "顺序表插入"},
        {"id": "seq_list_delete", "name": "顺序表删除"}, {"id": "linked_insert", "name": "单链表插入"}, {"id": "linked_delete", "name": "单链表删除"},
        {"id":"doubly_linked_list","name":"双链表"}, {"id":"circular_linked_list","name":"循环链表"}, {"id":"static_linked_list","name":"静态链表"},
    ]},
}



class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in {"/", "/index.html"}:
            self.path = "/templates/index.html"
        if self.path == "/api/topics":
            data = json.dumps(TOPICS, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()


def main(host: str = "0.0.0.0", port: int = 5000) -> None:
    os.chdir(BASE_DIR)
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"408 数据结构可视化演示网站已启动： http://{host}:{port}")
    print("按 Ctrl + C 停止服务")
    server.serve_forever()


if __name__ == "__main__":
    main()
