<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
<!--#include file="../../../inc/safe.asp"-->
<Script Language=Javascript src="editor.js"></Script>
<script language="javascript">
function aa()
{
ShowDialog('img.htm', 350, 315, true);
}
</script>


<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../login.asp';</SCRIPT>" 
	response.end
end if
 
'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.Cookies("masterflag"),",")
 for each ins in in_str
 	if trim(ins)="06" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 	response.redirect "../../err.asp"
 		response.end
 end if

%>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">

<link rel="stylesheet" type="text/css" href="../../css/style.css">
<style type="text/css">
<!--
.STYLE1 {color: #FF0000}
-->
</style>
</head>
<script LANGUAGE="JavaScript">
function check()
{
if (document.form.typeid.value=="")
{
alert("请选择产品所属类别！")
document.form.typeid.focus()
document.form.typeid.select()
return
}
if (document.form.prodName.value=="")
{
alert("请输入产品名称！")
document.form.prodName.focus()
document.form.prodName.select()
return
}

document.form.submit()
}
</script>
<script type="text/javascript"  src="../../ueditor/ueditor.config.js"></script>
<script type="text/javascript"  src="../../ueditor/ueditor.all.min.js"> </script>
<script type="text/javascript"  src="../../ueditor/lang/zh-cn/zh-cn.js"></script>
<table width="98%" border="0" cellspacing="0" cellpadding="0" align=center class="tableBorder"> 
  <tr> 
     <th height=25 colspan="2" class="tableHeaderText">产品管理</th> 
  </tr> 
  <tr> 
     <td colspan="2" class="forumRowHighlight"><p><B>注意</B>：<BR> 
         ①类别直接与发布的信息相关联，删除类别可能会影响到以前发布的产品信息。<BR> </td> 
  </tr> 
  
  <tr>
    <td width="19%" height=25 class="forumRowHighlight">&nbsp;</td>
	 <td width="81%" class="forumRowHighlight"><a href="prod.asp">管理产品</a> | <a href="prod_add.asp">添加产品</a> | <a href="prodcat.asp">管理类别</a> | <a href="prodcat_add.asp">添加类别</a> | <a href="prodphoto.asp">图片管理</a> | <a href="prodphoto_add.asp">添加图片</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td> 
  </tr> 
</table> 
<form name="form" method="POST" action="prod_save.asp?action=add"> 
<input type='hidden' name="picture" value = "">
  <TABLE width="100%" border="0" align=center cellpadding="0" cellspacing="1" class="tableBorder"> 
    <tr> 
      <th height=25 colspan="2" class="tableHeaderText">添加产品</th> 
    </tr> 
    <TR ALIGN="center"> 
      <TD> <TABLE width="100%" border="0" cellpadding="5" cellspacing="2" bordercolorlight="#CEE7FF" bordercolordark="#CEE7FF" style="border-collapse: collapse"> 
          <TR> 
            <TD width="107" align="right" nowrap class="Forumrow"><b>产品<b>分类</b>：</b></TD> 
            <TD colspan="4" class="Forumrow"><font color="#F4FAFF">
              <select name="typeid" size="1" class="lh17">
                <option >请选择所属类别</option>
                <%
			  Sql="Select * from benming_ch_ProdCat where root=0"
			  Set Rs=Server.CreateObject("ADODB.RecordSet")
			  Rs.open Sql,Conn,1,1
			  do while not Rs.eof
			  	Response.Write("<option  value="&Rs("id")&">==="&Rs("CatName")&"===</option>")
				Sql1="Select * from benming_ch_ProdCat where Root="&Rs("id")
				Set Rs1=Server.CreateObject("ADODB.RecordSet")
				Rs1.open Sql1,Conn,1,1
				do while not Rs1.eof
					Response.Write("<option value="&Rs1("id")&">&nbsp;&nbsp;"&Rs1("CatName")&"</option>")
					Rs1.movenext
				loop
				Rs1.close
				Set Rs1=nothing
			  	Rs.movenext
			  loop
			  Rs.close
			  Set Rs=nothing
			  %>
              </select>
              <a href="prodcat_add.asp"><font color='#FF0000'>添加</font></a></font></TD>
          </TR>
		  
		   <TR> 
            <TD align="right" valign="middle" class="Forumrow"><b>产品<b>名称</b>：</b></td> 
            <TD colspan="4" class="Forumrow"><font color="#F4FAFF">
			  <input name="prodName" type="text" class="smallInput" id="prodName" size="55" maxlength="100">
			  <font color='#FF0000'>*</font>			  </font></TD> 
          </TR>
		       <script language = "JavaScript" src = "../../../js/file_js.js" type="text/javascript"></script>  		  		  		  		 
		       <TR>
		         <td class="Forumrow" align="right"><b>产品型号： </b></td>
		         <TD colspan="4" class="Forumrow"><input name="prodCode" type="text" id="prodCode"></TD>
          </TR>
	       <TR>
		     <td height="55" align="right" class="Forumrow"><b>产品图片：</b></td>
		     <TD colspan="4" class="Forumrow"><input type=text name="magicfacepic1"><iframe id="d_file" frameborder="0" src="../../../inc/upload2.asp?tMode=3&istwo=0&utype=prod&hgc=1" width="450" height="22" scrolling="no"></iframe>&nbsp;&nbsp;  
			 <div id="magicframe(1)" style="visibility:hidden; position: absolute;width:10; left: 2px; top: 479px;">
        		<span class="STYLE1">
        		<iframe src="photoShow.asp?action=1" width="580" height="260" frameborder="0" scrolling="no"></iframe>
       		   </span></div>			 </TD>
	      </TR>
	      <TR >
		  	</TR>
          <TR> 
            <TD align="right" class="Forumrow"><b>产品属性： </b></TD> 
            <TD width="95" class="Forumrow">
		
              <input name="tjhome" type="checkbox" id="tjhome" value="1" > 
            首页推荐      		</TD> 
            <TD width="86" class="Forumrow"><input name="show" type="checkbox" id="show" value="0">
            隐藏</TD>
            <TD width="71" class="Forumrow" ><b>排序：</b>			</TD>
            <TD width="515" class="Forumrow"  ><input name="orderid" type="text" id="orderid" value="<%=GetOrderid()%>" size="5"></TD>
          </TR>

		  <TR>
		    <TD align="right" class="Forumrow"><b>关键字：</B></td>
		    <TD colspan="4" valign="middle" class="Forumrow"><input name="key" type="text" id="key" size="100"></TD>
	      </TR>
		  <TR> 
            <TD align="right" class="Forumrow"><b>产品描述：</b></td> 
            <TD colspan="4" valign="middle" class="Forumrow"><textarea name="desc" cols="100" rows="5" id="desc"></textarea></TD> 
          </TR> 
          <TR> 
           <TD align="right" class="Forumrow"><b>详细信息：</b></TD> 
            <TD colspan="4" class="Forumrow">
            <textarea name="content" id="myEditor" style="width:720px; height:300px"></textarea>
<script type="text/javascript">
    UE.getEditor('myEditor')
</script>
            </TD> 
          </TR> 
          <TR height="40"> 
            <TD colspan="5" align="center" class="Forumrow" height="40">
              <input type="button" name="Submit" value=" 提　交 保 存" class="smallInput" onClick="check()">
			  &nbsp;&nbsp;&nbsp; 
            <input type="reset" name="Submit2" value=" 重　新 添 写" class="smallInput">          </TR> 
      </TABLE></TD> 
    </TR> 
  </TABLE> 
  <Br/>
</FORM> 
<%

'取排序号
Function GetOrderid()
	Sql="SELECT max(orderid) FROM benming_ch_prod"
	Set Rs=Server.Createobject("ADODB.RecordSet")
	Rs.open Sql,Conn,1,1
	if len(Rs(0))>0 then
		GetOrderid=Rs(0)+1
	else
		GetOrderid=1
	end if

		

	Rs.close
	Set Rs=nothing
End Function
Conn.close
Set Conn=nothing
%>
